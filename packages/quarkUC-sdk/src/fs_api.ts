import { ArrayUtil, AsyncUtil, Check, NBoolean } from "@netdisk-sdk/utils"
import { QuarkUCClient } from "./client"
import { ICreateTaskResult, IFidExtend, IFile, IFileFid, IQueryPageParam, IQueryPageResult, ITaskStateResult, getFileFid, toSortStr } from "./types"


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
    task<E>(taskID: string, _await?: boolean): Promise<ITaskStateResult<E>> { throw '' }

    /** 回收站 */
    deepRecycleList(param?: IQueryRecycleListParam): Promise<IQueryRecycleListResult> { throw '' }
    /** 回收站 */
    recycleList(param?: IQueryRecycleListParam): Promise<IQueryRecycleListResult> { throw '' }
    /** 清空回收站 */
    recycleClear(): Promise<void> { throw '' }
    /** 删除指定回收站文件 */
    recycleRemove(file: IRecordIDExtend | IRecordIDExtend[]): Promise<void> { return void 0 as any }
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
QuarkUCFSApi.prototype.mkdir = async function (file_name: string, params: IMkderParam={}) {
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

/**
 * 回收站api
 */

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