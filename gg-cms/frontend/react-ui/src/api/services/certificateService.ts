import axios from 'axios';
import apiClient from '../client';
import { API_BASE_URL } from '@/config/api';
import { CertificateDto, CertificateVerificationDto } from '../types';

export const certificateService = {
  async getMine(): Promise<CertificateDto[]> {
    const response = await apiClient.get('/certificates/me');
    return response.data.data ?? [];
  },

  async downloadPdf(code: string): Promise<Blob> {
    const response = await apiClient.get(`/certificates/${encodeURIComponent(code)}/pdf`, { responseType: 'blob' });
    return response.data as Blob;
  },

  async verify(code: string): Promise<CertificateVerificationDto> {
    const response = await axios.get(`${API_BASE_URL}/public/certificates/${encodeURIComponent(code)}`);
    return response.data.data ?? { valid: false };
  },
};
