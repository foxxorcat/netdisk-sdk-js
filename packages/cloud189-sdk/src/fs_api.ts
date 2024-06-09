import { Method } from "@netdisk-sdk/utils";
import { Cloud189Client } from "./client";
import { AxiosRequestConfig } from "axios";
import { SignType } from "./types";

class Cloud189FSApi {
    client: Cloud189Client;
    constructor(client: Cloud189Client) {
        this.client = client
    }

    private async _post<T, D>(url: string, data: D, config: AxiosRequestConfig<D>) {
        return await this.client.requestApi<T, D>({
            method: Method.POST,
            data,
            ...config
        }, SignType.V2P)
    }
    private async _get<T>(url: string, params: any, config: AxiosRequestConfig) {
        return await this.client.requestApi<T, any>({
            method: Method.GET,
            params,
            ...config
        }, SignType.V2P)
    }
}