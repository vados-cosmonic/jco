/** @module Interface example:node-fetch/simple-request **/
export function getJson(url: string | undefined): Response;
export interface Response {
  url: string,
  responseJson: string,
}
