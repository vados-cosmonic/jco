export namespace ExampleBrowserFetchPing {
  export function getJson(url: string, name: string | undefined): PingResponse;
}
export interface PingResponse {
  name?: string,
  url: string,
  repsonseJson: string,
}
