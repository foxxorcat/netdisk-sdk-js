import { Await } from "./types"
import { Check } from "./check.js"
import { ObjectUtil } from "./object"

type ExtractFile<Result> =
    Result extends Array<infer F> ? F :
    Result extends { list: Array<infer F> } ? F :
    Result extends { data: Array<infer F> } ? F :
    never

const defaultTransferFile = (result: any): any => {
    if (Check.isArray(result)) return result
    if (ObjectUtil.isObject(result)) {
        if ('list' in result) return result['list']
        if ('data' in result) return result['data']
    }
    return []
}
const defaultHasMore = (result: any): boolean => {
    return result != null && defaultTransferFile(result).length > 0
}

export const createListIter = <ListParam, ListResult, IFile = ExtractFile<ListResult>, FPage extends string = 'page'>(
    list: (param: ListParam) => Await<ListResult>,
    option: {
        /** 分页、偏移使用的字段 */
        pageField?: FPage,
        /** 使用偏移，而不是分页 @default pageField != 'page' */
        offsetFlag?: boolean
        transferFile?: (result: ListResult) => IFile[],
        hasMore?: (result: ListResult) => boolean,
    } = {}
): ((param: ListParam & { [K in FPage]?: never }) => AsyncGenerator<IFile>) => {
    const {
        pageField = "page",
        offsetFlag = pageField != "page",
        transferFile = defaultTransferFile,
        hasMore = defaultHasMore
    } = option

    return async function* (param: Omit<ListParam, FPage>) {
        for (let [page, count] = [1, 0]; ; page++) {
            const result = await list({
                ...param,
                [pageField]: offsetFlag ? count : page
            } as any)

            for (const file of transferFile(result)) {
                yield file
                count++
            }

            if (!hasMore(result)) break
        }
    }
}

export const createWalkIter = <Param, IFile>(
    fileIter: (param: Param) => AsyncIterable<IFile>,
    option: {
        /** 获取下一层参数 */
        getNextParam: (file: IFile, param: Param) => Param | null,
        /** 进入目录深度 @default Infinity */
        deep?: number,
        /** 最多获取数量 @default Infinity */
        maxcount?: number
    }
) => {
    const { getNextParam, deep = Infinity, maxcount = Infinity } = option

    let currenCount = 0
    const walk = async function* (param: Param, currenDeep: number): AsyncIterable<IFile> {
        for await (const file of fileIter(param)) {
            if (++currenCount > maxcount) {
                break
            }

            yield file

            const folderParam = getNextParam(file, param)
            if (folderParam != null && currenDeep < deep) {
                yield* walk(folderParam, currenDeep + 1)
            }
        }
    }
    return (param: Param) => walk(param, 0)
}