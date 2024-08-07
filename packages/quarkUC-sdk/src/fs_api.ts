import { ArrayUtil, AsyncUtil, Check, ContentType, NBoolean } from "@netdisk-sdk/utils"
import { QuarkUCClient } from "./client"
import { ICreateTaskResult, IFidExtend, IFile, IFileFid, IQueryPageParam, IQueryPageResult, ITaskStateResult, getFileFid, toSortStr } from "./types"
import OSS from 'ali-oss';

export type IRecordID = Pick<IRecycleFile, 'record_id'>;
export type IRecordIDExtend = IRecordID | string
export const getRecordID = (file: IRecordIDExtend) => Check.isString(file) ? file : file.record_id

export class QuarkUCFSApi {
    client: QuarkUCClient
    constructor(client: QuarkUCClient) {
        this.client = client
    }

    sort(param?: IQuerySortParam): Promise<IFile> { throw '' }
    info(file: IFidExtend, param?: { _fetch_full_path?: number }): Promise<IFile> { throw '' }
    rename(file: IFidExtend, newName: string): Promise<void> { throw '' }
    mkdir(name: string, param?: IMkderParam): Promise<IFile> { throw '' }
    delete(file: IFidExtend[], exclude?: IFileFid[]): Promise<ICreateTaskResult> { throw '' }
    download(file: IFidExtend): Promise<IDownloadResult>
    download(file: IFidExtend[]): Promise<IDownloadResult[]>
    download() { return void 0 as any }

    /**
     * 
     */
    preUpdate(param: IPreUpdateParam): Promise<IPreUpdateResult> { throw '' }
    hashUpdate(param: IHashUpdateParam): Promise<IHashUpdateResult> { throw '' }
    finishUpdate(param: IFinishUpdateParam): Promise<IFinishUpdateResult> { throw '' }
    partUpdate(pre: IPartUpdateParam) { throw '' }

    task<E>(taskID: string, _await?: boolean): Promise<ITaskStateResult<E>> { throw '' }

    /************
     * 回收站管理
     ***********/

    /** 回收站 */
    deepRecycleList(param?: IQueryRecycleListParam): Promise<IQueryRecycleListResult> { throw '' }
    /** 回收站 */
    recycleList(param?: IQueryRecycleListParam): Promise<IQueryRecycleListResult> { throw '' }
    /** 清空回收站 */
    recycleClear(): Promise<void> { throw '' }
    /** 删除指定回收站文件 */
    recycleRemove(file: IRecordIDExtend | IRecordIDExtend[]): Promise<void> { throw '' }
    /** 恢复回收站文件 */
    recycleRecover(file: IRecordIDExtend | IRecordIDExtend[]): Promise<ICreateTaskResult> { throw '' }


}

export type IQuerySortParam = Partial<IQueryPageParam<{
    pdir_fid: string
    force: NBoolean
    _fetch_banner: NBoolean
    _fetch_share: NBoolean
}, 'file_type' | 'updated_at'>>;
QuarkUCFSApi.prototype.sort = async function (params = {}) {
    params = {
        pdir_fid: '0',
        force: 0,
        _fetch_banner: 0, _fetch_share: 0,
        _page: 1,
        _size: 50,
        _sort: [['file_type', 'asc'], ['updated_at', 'desc']],
        ...params,
    }
    // @ts-ignore
    params._sort = toSortStr(params._sort)
    const { body: { data: { list }, metadata } } = await this.client.agentApi
        .get('/file/sort')
        .query({
            ...params,
            _fetch_total: 1
        })

    return {
        list,
        ...metadata
    }
}

QuarkUCFSApi.prototype.info = async function (file, param = {}) {
    const fid = getFileFid(file)
    const { body: { data } } = await this.client.agentApi
        .get('/file/info')
        .query({ fid, ...param })
    return data
}

export type IMkderParam = Partial<{
    dir_init_lock: boolean
    pdir_fid: string,
    dir_path: string
}>;
QuarkUCFSApi.prototype.mkdir = async function (file_name: string, params: IMkderParam = {}) {
    const { body: { data } } = await this.client.agentApi.post('/file')
        .send({
            file_name,
            pdir_fid: "0",
            dir_init_lock: false,
            dir_path: "",
            ...params
        })
    return data
}

QuarkUCFSApi.prototype.rename = async function (file, file_name) {
    const fid = getFileFid(file)
    await this.client.agentApi
        .post('/file/rename')
        .send({ fid, file_name })
}

QuarkUCFSApi.prototype.delete = async function (files, excludeFiles = []) {
    const exclude_fids = ArrayUtil.toArray(excludeFiles).map(getFileFid)
    const filelist = ArrayUtil.toArray(files).map(getFileFid)
    const { body: { data } } = await this.client.agentApi
        .post('/file/delete')
        .send({ action_type: 2, exclude_fids, filelist })
    return data
}

export interface IDownloadResult extends IFile {
    download_url: string
    md5: string
}
QuarkUCFSApi.prototype.download = async function (files) {
    const fids = ArrayUtil.toArray(files).map(getFileFid)
    const { body: { data } } = await this.client.agentApi
        .post('/file/download')
        .send({ fids })
    return ArrayUtil.isArray(files) ? data : data[0]
}

export type IPreUpdateParam = {
    /** 父目录id */
    pdir_fid: string,
    dir_name?: string,

    file_name: string,
    size: number,
    /** mime 类型 */
    format_type: string,
    /** 时间戳（毫秒） */
    l_updated_at?: number,
    /** 时间戳（毫秒） */
    l_created_at?: number
    ccp_hash_update?: boolean,
    /** 并行上传 */
    parallel_upload?: boolean,
};
export type IPreUpdateResult = {
    task_id: string,
    upload_id: string,
    obj_key: string,
    upload_url: string,
    fid: string,
    bucket: string,
    callback: {
        callbackUrl: string,
        callbackBody: string
    },
    format_type: string,
    size: number,
    auth_info: string,
    auth_info_expried: number,
    file_struct: {
        platform_source: string
    }
    finish: false
};
QuarkUCFSApi.prototype.preUpdate = async function (param) {
    const now = Date.now()
    const { body: { data } } = await this.client.agentApi
        .post('/file/upload/pre')
        .send({
            parallel_upload: true,
            ccp_hash_update: true,
            dir_name: '',
            l_updated_at: now,
            l_created_at: now,
            ...param
        })
    return data
}

export type IHashUpdateParam = {
    /** 文件完整md5 */
    md5?: string;
    /** 文件完整sha1 */
    sha1: string;
    task_id: string
}
export type IHashUpdateResult = {
    finish: true,
    obj_key: string,
    fid: string,
    format_type: string,
    thumbnail?: string,
    preview_url?: string,
    path_fid_map: any
} | { finish: false };
QuarkUCFSApi.prototype.hashUpdate = async function (param) {
    const { body: { data } } = await this.client.agentApi
        .post('/file/update/hash')
        .send({ md5: 'd41d8cd98f00b204e9800998ecf8427e', ...param })
    return data
}
export type IFinishUpdateParam = {
    obj_key: string,
    task_id: string
}
export type IFinishUpdateResult = {
    task_id: string,
    obj_key: string,
    fid: string,
    pdir_fid: string,
    file_name: string,
    md5: string,
    sha1: string,
    thumbnail?: string,
    preview_url?: string,
    format_type: string,
    size: number,
    file_struct: { platform_source: string }
    finish: true,
};
QuarkUCFSApi.prototype.finishUpdate = async function (param) {
    const { body: { data } } = await this.client.agentApi
        .post('/file/update/finish')
        .send(param)
    return data
}

export type IPartUpdateParam = Pick<IPreUpdateResult, 'bucket' | 'upload_url' | 'obj_key' | 'callback'> & {

};
QuarkUCFSApi.prototype.partUpdate = async function (param) {
    const { bucket, upload_url: endpoint, obj_key, callback } = param
    // const auth_meta = `PUT\n\n${format_type}`
    const client = new OSS({
        bucket: bucket,
        accessKeyId: "null",
        accessKeySecret: "null",
        endpoint: endpoint.replace("http://", "https://"),
        // @ts-ignore
        authorization: (e, r) => {
            console.log(e, r)
        },
    })
    const res = await client.multipartUpload(obj_key, new Uint8Array(0), {
        callback: {
            url: callback.callbackUrl,
            body: callback.callbackBody
        }
    })
}


QuarkUCFSApi.prototype.task = async function (task_id, _await = false) {
    let retry_index = 0
    let result: ITaskStateResult
    do {
        const { body: { data } } = await this.client.agentApi
            .get('/task')
            .query({ task_id, retry_index: retry_index++ })
        result = data
    } while ((_await && result.status == 0) && (await AsyncUtil.sleep(500) ?? true))
    return result as any
}

/************
 * 回收站api
 ************/

export type IQueryRecycleListParam = Partial<IQueryPageParam<{

}, 'move_recycle_at'>>;
export interface IRecycleFile extends IFile {
    record_id: string,
    move_recycle_at: number
    move_deep_recycle_at: number
}
export type IQueryRecycleListResult = IQueryPageResult<IRecycleFile>;
QuarkUCFSApi.prototype.recycleList = async function (params = {}) {
    params = {
        _page: 1,
        _size: 50,
        _sort: ['move_recycle_at:desc'],
        ...params
    }
    // @ts-ignore
    params._sort = toSortStr(params._sort)
    const { body: { data: { list, total }, metadata } } = await this.client.agentApi
        .get('/file/recycle/list')
        .query({ ...params, _fetch_total: 1 })

    return {
        list,
        _total: total,
        ...metadata
    }
}

QuarkUCFSApi.prototype.deepRecycleList = async function (params = {}) {
    params = {
        _page: 1,
        _size: 50,
        _sort: ['move_recycle_at:desc'],
        ...params
    }
    // @ts-ignore
    params._sort = toSortStr(params._sort)
    const { body: { data: { list, total }, metadata } } = await this.client.agentApi
        .get('/file/deep_recycle/list')
        .query({ ...params, _fetch_total: 1 })

    return {
        list,
        _total: total,
        ...metadata
    }
}

QuarkUCFSApi.prototype.recycleRecover = async function (files) {
    const record_list = ArrayUtil.toArray(files).map(getRecordID)
    const { body: { data } } = await this.client.agentApi
        .post('/file/recycle/recover')
        .send({
            select_mode: 2,
            record_list
        })
    return data
}

QuarkUCFSApi.prototype.recycleRemove = async function (files) {
    const record_list = ArrayUtil.toArray(files).map(getRecordID)
    const { body: { data } } = await this.client.agentApi
        .post('/file/recycle/remove')
        .send({
            select_mode: 2,
            record_list
        })
    return data
}

QuarkUCFSApi.prototype.recycleClear = async function () {
    const { body: { data } } = await this.client.agentApi
        .post('/file/recycle/remove')
        .send({ select_mode: 1, })
    return data
}