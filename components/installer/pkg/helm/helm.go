// Copyright (c) 2021 Gitpod GmbH. All rights reserved.
// Licensed under the GNU Affero General Public License (AGPL).
// See License-AGPL.txt in the project root for license information.

package helm

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"sigs.k8s.io/yaml"

	"github.com/gitpod-io/gitpod/installer/pkg/common"
	"github.com/gitpod-io/gitpod/installer/third_party/charts"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart"
	"helm.sh/helm/v3/pkg/chart/loader"
	"helm.sh/helm/v3/pkg/downloader"
	"helm.sh/helm/v3/pkg/getter"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/storage/driver"
)

// TemplateConfig
type TemplateConfig struct {
	Namespace string
}

func getContext(settings Settings) context.Context {
	// Create context and prepare the handle of SIGTERM
	ctx := context.Background()
	ctx, cancel := context.WithCancel(ctx)

	// Handle SIGTERM
	cSignal := make(chan os.Signal)
	signal.Notify(cSignal, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-cSignal
		settings.Write("Release of Gitpod has been cancelled.")
		cancel()
	}()

	return ctx
}

func installDependencies(settings Settings) error {
	client := action.NewDependency()

	man := &downloader.Manager{
		Out:              &bytes.Buffer{},
		ChartPath:        settings.Chart,
		Keyring:          client.Keyring,
		SkipUpdate:       client.SkipRefresh,
		Verify:           downloader.VerifyNever,
		RegistryClient:   settings.ActionConfig.RegistryClient,
		Getters:          getter.All(settings.Env),
		RepositoryConfig: settings.Env.RepositoryConfig,
		RepositoryCache:  settings.Env.RepositoryCache,
		Debug:            false,
	}

	err := man.Update()
	if err != nil {
		return fmt.Errorf("error pulling Helm dependency for %s: %w", settings.Chart, err)
	}

	return nil
}

// runInstall emulates this function in Helm with simplified error handling
// https://github.com/helm/helm/blob/9fafb4ad6811afb017cc464b630be2ff8390ac63/cmd/helm/install.go#L177
func runInstall(settings Settings, client *action.Install) (*release.Release, error) {
	name, _, err := client.NameAndChart([]string{
		settings.Config.Name,
		settings.Chart,
	})
	if err != nil {
		return nil, err
	}
	client.ReleaseName = name

	p := getter.All(settings.Env)
	vals, err := settings.Values.MergeValues(p)
	if err != nil {
		return nil, err
	}

	chartRequested, err := loader.Load(settings.Chart)
	if err != nil {
		return nil, err
	}

	return client.RunWithContext(getContext(settings), chartRequested, vals)
}

func writeCharts(chart *charts.Chart) (string, error) {
	dir, err := os.MkdirTemp("", chart.Name)
	if err != nil {
		return "", err
	}

	err = chart.Export(dir)
	if err != nil {
		return "", err
	}

	return dir, nil
}

// AffinityYaml convert an affinity into a YAML byte array
func AffinityYaml(orLabels ...string) ([]byte, error) {
	affinities := common.Affinity(orLabels...)

	marshal, err := yaml.Marshal(affinities)
	if err != nil {
		return nil, err
	}

	return marshal, nil
}

func ImagePullSecrets(key string, ctx *common.RenderContext) string {
	if len(ctx.Config.ImagePullSecrets) > 0 {
		var pullSecrets []string
		for _, i := range ctx.Config.ImagePullSecrets {
			pullSecrets = append(pullSecrets, i.Name)
		}

		// Helm array nomenclature
		return KeyValue(key, fmt.Sprintf("{%s}", strings.Join(pullSecrets, ",")))
	}

	// Nothing to be set
	return ""
}

// ImportTemplate allows for Helm charts to be imported into the installer manifest
func ImportTemplate(chart *charts.Chart, templateCfg TemplateConfig, pkgConfig PkgConfig) common.HelmFunc {
	return func(cfg *common.RenderContext) (r []string, err error) {
		defer func() {
			if err != nil {
				err = fmt.Errorf("cannot import template %s: %w", chart.Name, err)
			}
		}()

		helmConfig, err := pkgConfig(cfg)
		if err != nil {
			return nil, err
		}

		if !helmConfig.Enabled {
			return nil, nil
		}

		dir, err := writeCharts(chart)
		if err != nil {
			return nil, err
		}

		settings := SettingsFactory(
			&Config{
				Debug:     false,
				Name:      chart.Name,
				Namespace: cfg.Namespace,
			},
			dir,
			helmConfig.Values,
		)

		if _, err := os.Stat(filepath.Join(dir, "charts")); err != nil {
			err = installDependencies(settings)
			if err != nil {
				return nil, err
			}
		}

		client := action.NewInstall(settings.ActionConfig)
		client.DryRun = true
		client.ReleaseName = "RELEASE-NAME"
		client.Replace = true // Skip the name check
		client.ClientOnly = true
		if templateCfg.Namespace == "" {
			client.Namespace = cfg.Namespace
		} else {
			client.Namespace = templateCfg.Namespace
		}

		rel, err := runInstall(settings, client)
		if err != nil {
			return nil, err
		}
		if rel == nil {
			return nil, fmt.Errorf("release for %s generated an empty value", settings.Config.Name)
		}

		// Fetch any additional Kubernetes files that need applying
		var templates []string
		for _, obj := range chart.AdditionalFiles {
			b, err := chart.Content.ReadFile(obj)
			if err != nil {
				return nil, err
			}
			templates = append(templates, string(b))
		}

		return append(templates, rel.Manifest), nil
	}
}

func CreateHelmChart(chartYaml chart.Metadata, objs []string) (*string, error) {
	dir, err := os.MkdirTemp("", chartYaml.Name)
	if err != nil {
		return nil, err
	}

	err = os.Mkdir(fmt.Sprintf("%s/crds", dir), 0755)
	if err != nil {
		return nil, err
	}

	err = os.Mkdir(fmt.Sprintf("%s/templates", dir), 0755)
	if err != nil {
		return nil, err
	}

	fc, err := yaml.Marshal(chartYaml)
	if err != nil {
		return nil, err
	}

	err = os.WriteFile(fmt.Sprintf("%s/Chart.yaml", dir), fc, 0644)
	if err != nil {
		return nil, err
	}

	// convert everything to individual objects
	runtimeObjs, err := common.YamlToRuntimeObject(objs)
	if err != nil {
		return nil, err
	}

	for _, obj := range runtimeObjs {
		helmDir := "templates"
		if obj.Kind == "CustomResourceDefinition" {
			helmDir = "crds"
		}

		err = os.WriteFile(fmt.Sprintf("%s/%s/%s-%s.yaml", dir, helmDir, strings.ToLower(obj.Kind), obj.Metadata.Name), []byte(obj.Content), 0644)
		if err != nil {
			return nil, err
		}
	}

	return &dir, nil
}

func InstallOrUpgrade(name string, namespace string, dir string) error {
	settings := SettingsFactory(
		&Config{
			Debug:     false,
			Name:      name,
			Namespace: namespace,
		},
		dir,
		nil,
	)

	if err := settings.ActionConfig.Init(settings.Env.RESTClientGetter(), namespace, "configmap", func(format string, v ...interface{}) {}); err != nil {
		return err
	}

	histClient := action.NewHistory(settings.ActionConfig)
	histClient.Max = 1
	if _, err := histClient.Run(name); err == driver.ErrReleaseNotFound {
		fmt.Fprintf(os.Stderr, "Release %q does not exist. Installing it now.\n", name)

		client := action.NewInstall(settings.ActionConfig)
		client.Atomic = true
		client.CreateNamespace = true
		client.Namespace = namespace
		client.Timeout = 600 * time.Second
		client.Wait = true

		rel, err := runInstall(settings, client)
		if err != nil {
			return err
		}
		if rel == nil {
			return fmt.Errorf("release for %s generated an empty value", settings.Config.Name)
		}
	}

	os.Exit(1)

	// cleanup on fail
	// reset values

	return nil
}
