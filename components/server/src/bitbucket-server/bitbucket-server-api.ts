/**
 * Copyright (c) 2022 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License-AGPL.txt in the project root for license information.
 */


declare namespace BitbucketServer {

    export namespace Schema {
        export interface Repository {
            id: number;
            slug: string;
            name: string;
            public: boolean;
            links: {
                clone: {
                    href: string;
                    name: string;
                }[]
            }
            project: Project;
        }

        export interface Project {
            key: string;
            id: number;
            name: string;
            public: boolean;
        }
    }
}


// {
//     "slug": "test123",
//     "id": 3,
//     "name": "test123",
//     "hierarchyId": "670d2b6499d312c9deb8",
//     "scmId": "git",
//     "state": "AVAILABLE",
//     "statusMessage": "Available",
//     "forkable": true,
//     "project": {
//         "key": "JLDEC",
//         "id": 2,
//         "name": "jldec-project",
//         "public": false,
//         "type": "NORMAL",
//         "links": {
//             "self": ...
//         }
//     },
//     "public": false,
//     "links": {
//         "clone": [
//             ...,
//             {
//                 "href": "https://bitbucket.gitpod-self-hosted.com/scm/jldec/test123.git",
//                 "name": "http"
//             }
//         ],
//         "self": ...
//     }
// }



// {
//     "name": "roboquat",
//     "emailAddress": "roboquat@gitpod.io",
//     "id": 102,
//     "displayName": "Robot Kumquat",
//     "active": true,
//     "slug": "roboquat",
//     "type": "NORMAL",
//     "links": {
//         "self": [
//             {
//                 "href": "https://bitbucket.gitpod-self-hosted.com/users/roboquat"
//             }
//         ]
//     }
// }
