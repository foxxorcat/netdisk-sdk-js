export namespace ContentType {
    export const FormUrlencoded = "application/x-www-form-urlencoded; charset=UTF-8"
    export const JSON = "application/json; charset=UTF-8"
    export const Stream = "application/octet-stream"
    export const FormData = "multipart/form-data; charset=UTF-8"
}

export enum Method {
    GET = "GET",
    HEAD = "HEAD",
    POST = "POST",
    PUT = 'PUT',
    DELETE = 'DELETE',
    CONNECT = 'CONNECT',
    OPTIONS = 'OPTIONS',
    TRACE = 'TRACE',
    PATCH = 'PATCH'
}