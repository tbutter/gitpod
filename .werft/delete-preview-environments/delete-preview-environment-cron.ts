import { Werft } from '../util/werft';
import * as fs from 'fs';
import * as Tracing from '../observability/tracing';
import { SpanStatusCode } from '@opentelemetry/api';
import { wipePreviewEnvironmentAndNamespace, helmInstallName, listAllPreviewNamespaces } from '../util/kubectl';
import { exec, ExecOptions } from './shell';

// Will be set once tracing has been initialized
let werft: Werft

const context = JSON.parse(fs.readFileSync('context.json').toString());

Tracing.initialize()
    .then(() => {
        werft = new Werft("delete-preview-environment-cron")
    })
    .then(() => deletePreviewEnvironments())
    .then(() => werft.endAllSpans())
    .catch((err) => {
        werft.rootSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err
        })
        werft.endAllSpans()
    })

async function deletePreviewEnvironments() {
    werft.phase("Fetching branches");
    const branches = getAllBranches();
    werft.done("Fetching branches");

    werft.phase("Fetching previews");
    const previews = listAllPreviewNamespaces({});
    werft.done("Fetching previews");

    werft.phase("Mapping previews => branches")
    var previewBranchMap = new Map<string, string>()
    previews.forEach(preview => {
        branches.forEach(branch => {
            if (previewHasBranch(branch, preview)) {
                previewBranchMap.set(preview, branch)
            }
        });

        if (!previewBranchMap.has(preview)) {
            previewBranchMap.set(preview, "")
        }
    });
    werft.done("Mapping previews => branches")

    werft.phase("deleting previews")
    try {
        previewBranchMap.forEach((branch: string, preview: string) => {
            if (branch == "") {
                // wipePreviewEnvironmentAndNamespace(helmInstallName, preview, { slice: `Deleting preview ${preview}` })
            }
        });

    } catch (err) {
        werft.fail("deleting previews", err)
    }
    werft.done("deleting previews")
}

function getAllBranches(): string[] {
    return exec(`git branch -r | grep -v '\\->' | sed "s,\\x1B\\[[0-9;]*[a-zA-Z],,g" | while read remote; do echo "\${remote#origin/}"; done`).stdout.trim().split('\n');
}

function previewHasBranch(branch: string, preview: string): boolean {
    if (parseBranch(branch) == preview) {
        return true
    }
    return false
}

export function parseBranch(branch: string): string {
    let version = context.Name;
    const PREFIX_TO_STRIP = "gitpod-delete-preview-environment-";
    if (version.substr(0, PREFIX_TO_STRIP.length) === PREFIX_TO_STRIP) {
        version = version.substr(PREFIX_TO_STRIP.length);
    }
    return version
}