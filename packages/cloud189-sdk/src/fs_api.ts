import { Method } from "@netdisk-sdk/utils";
import { Cloud189Client } from "./client";
import { AxiosRequestConfig } from "axios";
import { SignType } from "./types";

class Cloud189FSApi {
    client: Cloud189Client;
    constructor(client: Cloud189Client) {
        this.client = client
    }
}