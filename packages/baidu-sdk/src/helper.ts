import { IFile } from "./types";

export const decryptMd5 = (md5: string) => {
    const c9 = md5[9].charCodeAt(0) - 'g'.charCodeAt(0)
    if (c9 < 0) return md5;

    var key2 = md5.slice(0, 9) + c9.toString(16) + md5.slice(10);
    var key3 = "";
    for (let i = 0; i < key2.length; i++)
        key3 += (parseInt(key2[i], 16) ^ (15 & i)).toString(16);
    return key3.slice(8, 16) + key3.slice(0, 8) + key3.slice(24, 32) + key3.slice(16, 24);
}

export const encryptMd5 = (md5: string) => {
    const key = md5.slice(8, 16) + md5.slice(0, 8) + md5.slice(24, 32) + md5.slice(16, 24);
    let key2 = "";
    for (let i = 0; i < key.length; i++)
        key2 += (parseInt(key[i], 16) ^ (15 & i)).toString(16);

    const key3 = String.fromCharCode(parseInt(key2[9], 16) + 'g'.charCodeAt(0))
    return key2.slice(0, 9) + key3 + key2.slice(10);
}

export const decodeSceKey = (scekey: string) => {
    return scekey.replaceAll('-', '+').replaceAll('~', '=').replaceAll('_', '/')
}

export const getFileTime = (file: IFile) => {
    const mtime = file.mtime ?? file.local_mtime ?? file.server_mtime
    const ctime = file.ctime ?? file.local_ctime ?? file.server_ctime
    return { mtime, ctime }
}

export const replaceUrl = (u: string, cond: boolean = true) => cond ? u.replace("d.pcs.baidu.com", "bjbgp01.baidupcs.com") : u