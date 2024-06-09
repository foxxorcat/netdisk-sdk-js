import { AxiosRequestConfig } from "axios";
import { Cloud189Client } from "./client";
import { ArrayUtil, Method, } from "@netdisk-sdk/utils";
import { IBoolean, ITime, ITime2, ITimestampMS, IFileListQueryParam, IFileListResult, DeepStringify } from "./types";

export class Cloud189SharedFSApi {
    client: Cloud189Client;
    constructor(client: Cloud189Client) {
        this.client = client
    }

    private async post<T, D>(url: string, data?: D, config?: AxiosRequestConfig<D>) {
        return await this.client.requestWeb<T, D>({
            method: Method.POST,
            url,
            data,
            ...config
        })
    }
    private async get<T>(url: string, params?: any, config?: AxiosRequestConfig) {
        return await this.client.requestWeb<T, any>({
            method: Method.GET,
            url,
            params,
            ...config
        })
    }


    async getFileDownloadUrl(params: DeepStringify<IGetFileDownloadUrlParam>) {
        const { data: { fileDownloadUrl } } = await this.get<{ fileDownloadUrl: string }>(
            "/api/open/file/getFileDownloadUrl.action",
            { dt: 1, ...params }
        )
        return fileDownloadUrl
    }

    // async listShareDirByShareIdAndFileId(params: IShareQueryParam) {
    //     const { data } = await this.get<IFileListResult<IShareFile, IShareFolder>>(
    //         '/v2/listShareDirByShareIdAndFileId.action',
    //         {
    //             shareDirFileId: params.fileId,
    //             ...params
    //         },{
    //             baseURL:WebURL
    //         }
    //     )
    //     return data
    // }

    /**
     * 列出分享目录
     * @param params 
     * @returns 
     */
    async listShareDir(params: DeepStringify<IShareQueryParam>) {
        const { data } = await this.get<IFileListResult<IShareFile, IShareFolder>>(
            '/api/open/share/listShareDir.action',
            {
                // js数字过大精度丢失
                'sign-type': 1,
                shareDirFileId: params.fileId,
                ...params
            }
        )
        return data
    }
    async *listShareDirIter(params: IShareQueryParam) {
        let [pageNum = 1, pageSize = 100, fileId] = [Number(params.pageNum), Number(params.pageSize), String(params.fileId)]
        let fileListAO: IFileListResult<IShareFile, IShareFolder>['fileListAO']
        do {
            const resp = await this.get<IFileListResult<IShareFile, IShareFolder>>(
                '/api/open/share/listShareDir.action',
                {
                    ...params,
                    // js数字过大精度丢失
                    'sign-type': 1,

                    fileId,
                    shareDirFileId: fileId,
                    pageNum: pageNum++
                }
            )
            fileListAO = resp.data.fileListAO

            if (fileListAO.folderList) yield* fileListAO.folderList
            if (fileListAO.fileList) yield* fileListAO.fileList

        } while (ArrayUtil.arrayLengthCount(fileListAO.fileList, fileListAO.folderList) >= pageSize)
    }

    /**
     * 获取分享的文件信息
     * @param shareCode 
     * @returns 
     */
    async getShareInfoByCode(shareCode: string) {
        const { data } = await this.get<IShareInfoByCode>(
            '/api/open/share/getShareInfoByCode.action',
            { shareCode }
        )
        return data
    }

    /**
     * 获取分享的文件信息
     * @param shareCode 
     * @returns 
     */
    async getShareInfoByCodeV2(shareCode: string) {
        const { data } = await this.get<IShareInfoByCode>(
            '/api/open/share/getShareInfoByCodeV2.action',
            { shareCode }
        )
        return data
    }

    /**
     * 验证提取码是否正确
     * @param shareCode 
     * @param accessCode 
     * @returns 
     */
    async checkAccessCode(shareCode: string, accessCode: string) {
        const { data: { shareId } } = await this.get<{ shareId: number }>(
            '/api/open/share/checkAccessCode.action',
            { shareCode, accessCode }
        )
        return Boolean(shareId)
    }
}

export interface IShareInfoByCode {
    accessCode: string,
    /** 分享者信息 */
    creator: {
        /** 头像地址 */
        iconURL: string,
        oper: boolean,
        /** 用户名 */
        ownerAccount: string,
        superVip: number,
        vip: number
    },

    /**
     * 有效时间(时间戳ms)
     */
    expireTime: ITimestampMS,
    expireType: number,

    /** 文件创建时间 */
    fileCreateDate: ITime,
    /** 文件修改时间 */
    fileLastOpTime: ITime,
    /** 文件ID */
    fileId: string,
    /** 文件名称 */
    fileName: string,
    /** 文件大小 */
    fileSize: number,
    /** 文件类型(后缀) */
    fileType: string,
    isFolder: boolean,
    /** 是否需要提取码 */
    needAccessCode: IBoolean,
    reviewStatus: number,
    /** 分享时间(时间戳ms)  */
    shareDate: ITimestampMS,
    shareId: number,
    shareMode: number,
    shareType: number
}

export interface IShareQueryParam extends IFileListQueryParam {
    accessCode: string,
    shareId: number,
    shareMode: number,
};

export interface IShareFile {
    id: string
    name: string
    md5: string
    size: number
    createDate: ITime
    lastOpTime: ITime

    fileCata: number
    /** 文件媒体类型， 1：图片 2：音乐 3：视频 4：文档 */
    mediaType: number
    rev: ITime2
    starLabel: number
}

export interface IShareFolder {
    id: string,
    name: string,
    createDate: ITime,
    lastOpTime: ITime,

    fileListSize: number
    parentId: string

    fileCata: number
    rev: ITime2
    starLabel: number
}

export interface IGetFileDownloadUrlParam {
    fileId: string,
    shareId: number,
    /** 未知参数，会改变下载链接 */
    dt?: number,
}