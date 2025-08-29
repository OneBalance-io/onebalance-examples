import axios, { AxiosResponse } from 'axios';

const BASE_URL = 'https://be.onebalance.io';

// Note: Using the production API endpoint will produce a different predicted address
const PUBLIC_API_KEY = '42bb629272001ee1163ca0dbbbc07bcbb0ef57a57baf16c4b1d4672db4562c11';
const PUBLIC_API_KEY2 = 'f9703eaqsbma20tmtphg2jirm0hk8z8v2hkodrfrvhfm6ziesi7p38u991bnih5f';

// Helper function to create authenticated headers
export function createAuthHeaders(): Record<string, string> {
  return {
    'x-api-key': PUBLIC_API_KEY,
  };
}

export async function apiRequest<RequestData, ResponseData>(
  method: 'get' | 'post',
  endpoint: string,
  data: RequestData,
  isParams = false,
): Promise<ResponseData> {
  try {
    const config = {
      headers: createAuthHeaders(),
      ...(isParams ? { params: data } : {}),
    };

    const url = `${BASE_URL}${endpoint}`;

    const response: AxiosResponse<ResponseData> =
      method === 'post' ? await axios.post(url, data, config) : await axios.get(url, { ...config, params: data });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(JSON.stringify(error.response.data));
    }
    throw error;
  }
}

// API methods
export async function apiPost<RequestData, ResponseData>(endpoint: string, data: RequestData): Promise<ResponseData> {
  return apiRequest<RequestData, ResponseData>('post', endpoint, data);
}

export async function apiGet<RequestData, ResponseData>(endpoint: string, params: RequestData): Promise<ResponseData> {
  return apiRequest<RequestData, ResponseData>('get', endpoint, params, true);
}
