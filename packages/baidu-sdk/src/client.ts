import superagent, { Agent, Request } from "superagent";
import { ITokenSource } from "./auth_client";
import { throwError } from "./errors";
import { BaiduFSOpenApi } from "./fs_openapi";
import { BaiduFSApi } from "./fs_api";
import { BaiduShareFSApi } from "./fs_share_api";

export class BaiduClient {
    agentApi: Agent
    source: string | ITokenSource

    fsApi: BaiduFSApi
    fsShareApi: BaiduShareFSApi
    fsOpenApi: BaiduFSOpenApi
    fsYouthApi: Omit<BaiduFSApi, 'listall'>

    constructor(cookie: string, agent?: Agent)
    constructor(tokenSource: ITokenSource, agent?: Agent)

    constructor(source: any, agent?: Agent) {
        const authPlugin = (request: Request) => {
            const end = request.end
            request.end = async function () {
                if (typeof source == 'string') {
                    this.set("Cookie", source)
                } else {
                    const { accessToken } = await source.getToken()
                    this.query({ access_token: accessToken }).set("Cookie", "BDUID=0")
                }
                // @ts-ignore
                return end.apply(this, arguments)
            }
        }

        this.source = source
        this.agentApi = (agent ?? superagent.agent())
            // 增加授权信息
            .use(authPlugin)
            .set({ 'user-agent': 'pan.baidu.com' })
            .ok(throwError)
            .retry(3)

        this.fsApi = new BaiduFSApi(this, 'https://pan.baidu.com')
        this.fsShareApi = new BaiduShareFSApi(this)
        this.fsYouthApi = new BaiduFSApi(this, 'https://pan.baidu.com/youth')
        this.fsOpenApi = new BaiduFSOpenApi(this)
    }

    setDevuid(devuid: string) {
        this.agentApi.query({ devuid })
        return this
    }

    async redirectDlink(dlink: string | { dlink: string }, ua = "netdisk"):Promise<string|null> {
        const link = typeof dlink == 'string' ? dlink : dlink.dlink
        if (typeof fetch != 'undefined') {
            const url = new URL(link)
            const headers: Record<string, string> = { 'user-agent': ua }
            if (typeof this.source === 'string') {
                headers['cookie'] = this.source
            } else {
                const { accessToken } = await this.source?.getToken() || {}
                const search = url.searchParams; search.set('access_token', accessToken)
                url.search = search.toString()
            }

            const resp = await fetch(url, { method: 'HEAD', headers, redirect: 'manual' })
            return resp.headers.get('location')
        }
        const resp = await this.agentApi.head(link).set({ 'user-agent': ua })        
        return resp.headers['location'] || resp.xhr?.requestURL
    }
}