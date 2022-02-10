/**
 * Copyright (c) 2022 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License-AGPL.txt in the project root for license information.
 */

import { useState } from "react";

import { adminMenu } from "./admin-menu";
import { PageWithSubMenu } from "../components/PageWithSubMenu";

export default function TeamsSearchPage() {
    return (
        <PageWithSubMenu subMenu={adminMenu} title="Teams" subtitle="Search and manage teams.">
            <TeamsSearch />
        </PageWithSubMenu>
    )
}

export function TeamsSearch() {
    const [searching, setSearching] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const search = async () => {
        console.log(searchTerm);
        setSearching(false);
    }
    return <>
        <div className="pt-8 flex">
            <div className="flex justify-between w-full">
                <div className="flex">
                    <div className="py-4">
                        <svg className={searching ? 'animate-spin' : ''} width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" clipRule="evenodd" d="M6 2a4 4 0 100 8 4 4 0 000-8zM0 6a6 6 0 1110.89 3.477l4.817 4.816a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 010 6z" fill="#A8A29E" />
                        </svg>
                    </div>
                    <input type="search" placeholder="Search Teams" onKeyDown={(k) => k.key === 'Enter' && search()} onChange={(v) => { setSearchTerm(v.target.value) }} />
                </div>
                <button disabled={searching} onClick={search}>Search</button>
            </div>
        </div>
        <div className="flex flex-col space-y-2">
            <div className="px-6 py-3 flex justify-between text-sm text-gray-400 border-t border-b border-gray-200 dark:border-gray-800 mb-2">
                <div className="w-5/12">Name</div>
                <div className="w-4/12">Created</div>
                <div className="w-3/12">Member count</div>
            </div>

        </div>
    </>
}