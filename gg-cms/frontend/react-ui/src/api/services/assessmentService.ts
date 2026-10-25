import apiClient from '../client';
import {
  AssessmentAnswerDto,
  AssessmentDefinitionDto,
  AssessmentHistoryDto,
  AssessmentStartDto,
  AssessmentSubmitDto,
} from '../types';

const BASE = '/assessments';

export const assessmentService = {
  async getDefinition(assessmentId: number): Promise<AssessmentDefinitionDto> {
    const response = await apiClient.get(`${BASE}/${assessmentId}`);
    return response.data.data;
  },

  async start(assessmentId: number): Promise<AssessmentStartDto> {
    const response = await apiClient.post(`${BASE}/${assessmentId}/attempts`);
    return response.data.data;
  },

  async submit(assessmentId: number, attemptId: number, answers: AssessmentAnswerDto[]): Promise<AssessmentSubmitDto> {
    const response = await apiClient.post(`${BASE}/${assessmentId}/attempts/${attemptId}/submit`, { answers });
    return response.data.data;
  },

  async getMyAttempts(assessmentId: number): Promise<AssessmentHistoryDto> {
    const response = await apiClient.get(`${BASE}/${assessmentId}/attempts/me`);
    return response.data.data;
  },
};
