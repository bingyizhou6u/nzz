import { getJson, postJson, type ApiEnvelope } from "../../api";
import type { ApprovalPreviewState, ReviewActionResult, ReviewDocumentRow } from "./reviewTypes";

const reviewDocumentPath = "/api/review/documents";

export async function listReviewDocuments(): Promise<ReviewDocumentRow[]> {
  const response = await getJson<ApiEnvelope<ReviewDocumentRow[]>>(reviewDocumentPath);
  return response.data;
}

export async function getReviewDocument(id: string): Promise<ReviewDocumentRow> {
  const response = await getJson<ApiEnvelope<ReviewDocumentRow>>(`${reviewDocumentPath}/${encodeURIComponent(id)}`);
  return response.data;
}

export async function previewReviewDocument(id: string): Promise<ApprovalPreviewState> {
  const response = await getJson<ApiEnvelope<ApprovalPreviewState>>(
    `${reviewDocumentPath}/${encodeURIComponent(id)}/preview`
  );
  return response.data;
}

export async function approveReviewDocument(id: string): Promise<ReviewActionResult> {
  const response = await postJson<ApiEnvelope<ReviewActionResult>>(
    `${reviewDocumentPath}/${encodeURIComponent(id)}/approve`,
    {}
  );
  return response.data;
}

export async function rejectReviewDocument(id: string, reason: string): Promise<ReviewActionResult> {
  const response = await postJson<ApiEnvelope<ReviewActionResult>>(
    `${reviewDocumentPath}/${encodeURIComponent(id)}/reject`,
    { reason }
  );
  return response.data;
}
