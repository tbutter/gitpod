/**
 * Copyright (c) 2020 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License-AGPL.txt in the project root for license information.
 */

import { User, Token } from "@gitpod/gitpod-protocol";
import { inject, injectable } from "inversify";
import { AuthProviderParams } from "../auth/auth-provider";
import { BitbucketTokenHelper } from "../bitbucket/bitbucket-token-handler";
import * as BitbucketServer from "@atlassian/bitbucket-server";

@injectable()
export class BitbucketServerApiFactory {

    @inject(AuthProviderParams) protected readonly config: AuthProviderParams;
    @inject(BitbucketTokenHelper) protected readonly tokenHelper: BitbucketTokenHelper;

    /**
     * Returns a Bitbucket API client for the given user.
     * @param user The user the API client should be created for.
     */
    public async create(user: User): Promise<BitbucketServer> {
        const token = await this.tokenHelper.getTokenWithScopes(user, []);
        return this.createBitbucket(this.baseUrl, token);
    }

    protected createBitbucket(baseUrl: string, token: Token): BitbucketServer {
        const options = {
            baseUrl,
        };
        const client = new BitbucketServer(options);
        client.authenticate({
            type: "token",
            token: token.value
        })
        return client;
    }

    protected get baseUrl(): string {
        return `https://${this.config.host}`;
    }
}

@injectable()
export class BasicAuthBitbucketServerApiFactory extends BitbucketServerApiFactory {
    protected createBitbucket(baseUrl: string, token: Token): BitbucketServer {
        const options = {
            baseUrl,
        };
        const client = new BitbucketServer(options);
        client.authenticate({
            type: "basic",
            username: token.username || "nobody",
            password: token.value
        })
        return client;
    }
}
