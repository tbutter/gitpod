/**
 * Copyright (c) 2022 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License-AGPL.txt in the project root for license information.
 */

import { NavigatorContext, Repository, User, WorkspaceContext } from "@gitpod/gitpod-protocol";
import { log } from "@gitpod/gitpod-protocol/lib/util/logging";
import { TraceContext } from "@gitpod/gitpod-protocol/lib/util/tracing";
import { Schema } from "bitbucket";
import { inject, injectable } from "inversify";
import { BitbucketTokenHelper } from "../bitbucket/bitbucket-token-handler";
import { NotFoundError } from "../errors";
import { AbstractContextParser, IContextParser } from "../workspace/context-parser";
import { BitbucketServerApiFactory } from "./bitbucket-api-factory";

const DEFAULT_BRANCH = "master";

@injectable()
export class BitbucketServerContextParser extends AbstractContextParser implements IContextParser {

    @inject(BitbucketTokenHelper) protected readonly tokenHelper: BitbucketTokenHelper;
    @inject(BitbucketServerApiFactory) protected readonly apiFactory: BitbucketServerApiFactory;

    private async api(user: User) {
        return this.apiFactory.create(user);
    }


    public async handle(ctx: TraceContext, user: User, contextUrl: string): Promise<WorkspaceContext> {
        const span = TraceContext.startSpan("BitbucketServerContextParser.handle", ctx);

        try {
            const { host, owner, repoName, /*moreSegments, searchParams*/ } = await this.parseURL(user, contextUrl);

            return await this.handleNavigatorContext(ctx, user, host, owner, repoName);
        } catch (e) {
            span.addTags({ contextUrl }).log({ error: e });
            log.error({ userId: user.id }, "Error parsing Bitbucket context", e);
            throw e;
        } finally {
            span.finish();
        }
    }

    public async fetchCommitHistory(ctx: TraceContext, user: User, contextUrl: string, commit: string, maxDepth: number): Promise<string[] | undefined> {
        return undefined;
    }

    protected async isValidCommitHash(user: User, owner: string, repoName: string, potentialCommitHash: string) {
        if (potentialCommitHash.length !== 40) {
            return false;
        }
        try {
            const api = await this.api(user);
            const result = (await api.repositories.getCommit({ workspace: owner, repo_slug: repoName, commit: potentialCommitHash }));
            return result.data.hash === potentialCommitHash;
        } catch {
            return false;
        }
    }

    protected async isTag(user: User, owner: string, repoName: string, potentialTag: string) {
        try {
            const api = await this.api(user);
            const result = (await api.repositories.getTag({ workspace: owner, repo_slug: repoName, name: potentialTag }));
            return result.data.name === potentialTag;
        } catch {
            return false;
        }
    }

    protected async handleNavigatorContext(ctx: TraceContext, user: User, host: string, owner: string, repoName: string, more: Partial<NavigatorContext> = {}, givenRepo?: Schema.Repository): Promise<NavigatorContext> {
        const span = TraceContext.startSpan("BitbucketServerContextParser.handleNavigatorContext", ctx);
        try {
            const api = await this.api(user);
            const repo = givenRepo || (await api.repositories.get({ workspace: owner, repo_slug: repoName })).data;
            const repository = await this.toRepository(user, host, repo);
            span.log({ "request.finished": "" });

            if (!repo) {
                throw await NotFoundError.create(await this.tokenHelper.getCurrentToken(user), user, this.config.host, owner, repoName);
            }

            if (!more.revision) {
                more.ref = more.ref || repository.defaultBranch;
            }
            more.refType = more.refType || "branch";

            if (!more.revision) {
                const commits = (await api.repositories.listCommitsAt({ workspace: owner, repo_slug: repoName, revision: more.ref!, pagelen: 1 })).data;
                more.revision = commits.values && commits.values.length > 0 ? commits.values[0].hash : "";
                if ((!commits.values || commits.values.length === 0) && more.ref === repository.defaultBranch) {
                    // empty repo
                    more.ref = undefined;
                    more.revision = "";
                    more.refType = undefined;
                }
            }

            if (!more.path) {
                more.isFile = false;
                more.path = "";
            } else if (more.isFile === undefined) {
                const fileMeta = (await api.repositories.readSrc({ workspace: owner, repo_slug: repoName, format: "meta", commit: more.revision!, path: more.path!, pagelen: 1 })).data;
                more.isFile = (fileMeta as any).type === "commit_file";
            }

            return {
                ...more,
                title: `${owner}/${repoName} - ${more.ref || more.revision}${more.path ? ':' + more.path : ''}`,
                repository,
            } as NavigatorContext;
        } catch (e) {
            span.log({ error: e });
            log.error({ userId: user.id }, "Error parsing Bitbucket navigator request context", e);
            throw e;
        } finally {
            span.finish();
        }
    }


    protected async toRepository(user: User, host: string, repo: Schema.Repository): Promise<Repository> {
        if (!repo) {
            throw new Error('Unknown repository.');
        }
        // full_name: string
        // The concatenation of the repository owner's username and the slugified name, e.g. "evzijst/interruptingcow". This is the same string used in Bitbucket URLs.
        const fullName = repo.full_name!.split("/");
        const owner = fullName[0];
        const name = fullName[1];

        const result: Repository = {
            cloneUrl: `https://${host}/${repo.full_name}.git`,
            host,
            name,
            owner,
            private: !!repo.isPrivate,
            defaultBranch: repo.mainbranch ? repo.mainbranch.name : DEFAULT_BRANCH,
        }
        if (!!repo.parent && !!repo.parent.full_name) {
            const api = await this.api(user);
            const parentRepo = (await api.repositories.get({ workspace: repo.parent!.full_name!.split("/")[0], repo_slug: repo.parent!.full_name!.split("/")[1] })).data;
            result.fork = {
                parent: await this.toRepository(user, host, parentRepo)
            };
        }

        return result;
    }

}
