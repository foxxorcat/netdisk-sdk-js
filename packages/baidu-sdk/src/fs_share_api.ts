import { Check, ConstructorArgsType, ConstructorArgType, ContentType, Method, NBoolean, StringNumber } from "@netdisk-sdk/utils";
import { BaiduClient } from "./client"
import { IListParam } from "./fs_api";
import { Request } from 'superagent';
import { IFile } from "./types";

export const parseShareParam = (_url: string | URL): IShareParam | null => {
    const url = new URL(_url)
    const pwd = url.searchParams.get('pwd') ?? void 0
    if (url.pathname.startsWith('/s/')) {
        const shorturl = url.pathname.slice(3)
        if (shorturl != "") return { shorturl, pwd }
    } else if (url.pathname.startsWith('/share/init')) {
        const shorturl = url.searchParams.get('surl')
        if (shorturl != null) return { shorturl, pwd }

        const shareid = url.searchParams.get('shareid')
        const uk = url.searchParams.get('uk')
        if (shareid != null && uk != null) return { shareid, uk, pwd }
    }
    return null
}

export class BaiduShareFSApi {
    prefix = "https://pan.baidu.com"
    client: BaiduClient

    constructor(client: BaiduClient) {
        this.client = client
    }

    request(method: Method, url: string) {
        const md = method.toLowerCase();
        if (url.startsWith('/')) url = this.prefix + url
        const request = (this.client.agentApi as any)[md](url) as Request
        return request.set('Referer', 'http://pan.baidu.com/')
    }

    wxlist(param: IListShareParam): Promise<IListShareResult> { throw '' }

    transfer(param: ITransferShareParam, savePath: string, ...fsid: StringNumber[]): Promise<ITransferShareResult> { throw '' }
}

export type IShareParam = { pwd?: string, } & ({ shorturl: string } | { shareid: StringNumber, uk: StringNumber })
export type IListShareParam = IListParam<IShareParam & {
    root?: NBoolean,
}>;
export type IListShareResult = {
    title: string
    has_more: boolean
    list: IFile[]
    uk: number
    shareid: number
    seckey: string
};
BaiduShareFSApi.prototype.wxlist = async function (params) {
    const { body: { data } } = await this.request(Method.POST, '/share/wxlist')
        .type(ContentType.FormUrlencoded)
        .query({
            channel: "weixin",
            version: "2.2.2",
            clienttype: 25,
            web: 1,
        })
        .send({
            root: isRootPath(params.dir) ? 1 : 0,
            ...params,
        })
    return data
}
export const isRootPath = (path: string) => {
    return path == null || path == '' || path == '/'
}

export type ITransferShareParam = {
    /** 分享ID */
    shareid: StringNumber,
    /** uk */
    from: StringNumber,
    sekey: string,
    /** 0 同步，1 自适应，2 异步 */
    // async: 0 | 1 | 2
    /** 全局ondup,遇到重复文件的处理策略,
     * fail(默认，直接返回失败)、newcopy(重命名文件)、overwrite(覆盖文件)、skip（跳过文件）
     */
    // ondup: 'fail' | 'newcopy' | 'overwrite' | 'skip'
};
export type ITransferShareResult = {
    extra: {
        list: {
            /** 分享路径 */
            from: string,
            /** 分享id */
            from_fs_id: number,
            /** 保存路径 */
            to: string,
            /** 保存id */
            to_fs_id: number
        }[]
    },
    // 任务信息
    info: {
        errno: number,
        /** 分享id */
        fsid: number,
        /** 分享路径 */
        path: string
    }[],
    show_msg: string,
    task_id: number
};
BaiduShareFSApi.prototype.transfer = async function (param, path, ...fsids) {
    const fsidlist = JSON.stringify(fsids.map(v => parseInt(v as any)))
    const { body } = await this.request(Method.POST, '/share/transfer')
        .type(ContentType.FormUrlencoded)
        .query({ async: 1, ondup: 'newcopy', ...param })
        .send({ path, fsidlist })
    return body
}