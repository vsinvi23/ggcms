import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  useApproveCms,
  useSendCmsBack,
  useRejectCms,
  usePublishCms,
  useClaimReview,
  useReassignReview,
  useSaveReviewNote,
  useUpdateCms,
  useUploadCmsBody,
} from '@/api/hooks/useCms';
import { CmsUpdateDto } from '@/api/types';
import { ContentBlock } from '@/types/content';
import { toUserMessage } from '@/lib/errors';

export interface UseCmsWorkflowActionsOptions {
  cmsType: 'ARTICLE' | 'COURSE';
  cmsId: number;
  userId?: number;
  contentBlocks: ContentBlock[];
  buildUpdateData: () => CmsUpdateDto;
  onApproveSuccess?: () => void;
  onSaveAndApproveSuccess?: () => void;
  onPublishSuccess?: () => void;
  onSaveAndPublishSuccess?: () => void;
  onSendBackSuccess?: () => void;
  onRejectSuccess?: () => void;
  onReassignSuccess?: () => void;
}

export function useCmsWorkflowActions({
  cmsType,
  cmsId,
  userId,
  contentBlocks,
  buildUpdateData,
  onApproveSuccess,
  onSaveAndApproveSuccess,
  onPublishSuccess,
  onSaveAndPublishSuccess,
  onSendBackSuccess,
  onRejectSuccess,
  onReassignSuccess,
}: UseCmsWorkflowActionsOptions) {
  const { mutateAsync: approveCms } = useApproveCms();
  const { mutateAsync: sendBackCms } = useSendCmsBack();
  const { mutateAsync: rejectCms } = useRejectCms();
  const { mutateAsync: publishCms } = usePublishCms();
  const { mutateAsync: claimReview } = useClaimReview();
  const { mutateAsync: reassignReview } = useReassignReview();
  const { mutateAsync: saveReviewNote } = useSaveReviewNote();
  const updateCms = useUpdateCms();
  const uploadBody = useUploadCmsBody();

  const [reviewComment, setReviewComment] = useState('');
  const [isReviewActing, setIsReviewActing] = useState(false);
  const [reassignNote, setReassignNote] = useState('');
  const [showReassignPanel, setShowReassignPanel] = useState(false);

  const handleApprove = useCallback(async () => {
    if (!cmsId) return;
    setIsReviewActing(true);
    try {
      await approveCms({ id: cmsId, type: cmsType, data: undefined });
      toast.success(cmsType === 'COURSE'
        ? 'Course approved — it is now ready to publish'
        : 'Article approved — a publisher will pick it up from the queue');
      onApproveSuccess?.();
    } catch (err) { toast.error(toUserMessage(err, 'Failed to approve')); }
    finally { setIsReviewActing(false); }
  }, [cmsId, cmsType, approveCms, onApproveSuccess]);

  const handlePublish = useCallback(async () => {
    if (!cmsId) return;
    setIsReviewActing(true);
    try {
      await publishCms({ id: cmsId, type: cmsType, data: undefined });
      toast.success(cmsType === 'COURSE' ? 'Course published successfully' : 'Article published successfully');
      onPublishSuccess?.();
    } catch (err) { toast.error(toUserMessage(err, 'Failed to publish')); }
    finally { setIsReviewActing(false); }
  }, [cmsId, cmsType, publishCms, onPublishSuccess]);

  const handleSendBack = useCallback(async () => {
    if (!cmsId) return;
    setIsReviewActing(true);
    try {
      await sendBackCms({ id: cmsId, type: cmsType, data: { reviewerId: userId ?? 0, comment: reviewComment } });
      toast.success(cmsType === 'COURSE' ? 'Course sent back for revision' : 'Article sent back for revision');
      onSendBackSuccess?.();
    } catch (err) { toast.error(toUserMessage(err, 'Failed to send back')); }
    finally { setIsReviewActing(false); }
  }, [cmsId, cmsType, sendBackCms, userId, reviewComment, onSendBackSuccess]);

  const handleReject = useCallback(async () => {
    if (!cmsId) return;
    if (!reviewComment.trim()) { toast.error('Please provide a reason for rejection'); return; }
    setIsReviewActing(true);
    try {
      await rejectCms({ id: cmsId, type: cmsType, data: { reviewerId: userId ?? 0, comment: reviewComment } });
      toast.success(cmsType === 'COURSE' ? 'Course rejected' : 'Article rejected');
      onRejectSuccess?.();
    } catch (err) { toast.error(toUserMessage(err, 'Failed to reject')); }
    finally { setIsReviewActing(false); }
  }, [cmsId, cmsType, rejectCms, userId, reviewComment, onRejectSuccess]);

  const handleClaimReview = useCallback(async () => {
    if (!cmsId) return;
    setIsReviewActing(true);
    try {
      await claimReview({ id: cmsId, type: cmsType });
      toast.success('You are now the assigned reviewer');
    } catch (err) { toast.error(toUserMessage(err, 'Failed to claim review — it may have been claimed by someone else')); }
    finally { setIsReviewActing(false); }
  }, [cmsId, cmsType, claimReview]);

  const handleClaimForPublishing = useCallback(async () => {
    if (!cmsId) return;
    setIsReviewActing(true);
    try {
      await claimReview({ id: cmsId, type: cmsType });
      toast.success('You are now the assigned publisher');
    } catch (err) { toast.error(toUserMessage(err, 'Failed to claim — it may have been taken by someone else')); }
    finally { setIsReviewActing(false); }
  }, [cmsId, cmsType, claimReview]);

  const handleReassignReview = useCallback(async () => {
    if (!cmsId) return;
    setIsReviewActing(true);
    try {
      await reassignReview({ id: cmsId, type: cmsType, note: reassignNote });
      toast.success('Review released — another reviewer can now claim it');
      setShowReassignPanel(false);
      setReassignNote('');
      onReassignSuccess?.();
    } catch (err) { toast.error(toUserMessage(err, 'Failed to release review')); }
    finally { setIsReviewActing(false); }
  }, [cmsId, cmsType, reassignReview, reassignNote, onReassignSuccess]);

  const handleSaveReviewNote = useCallback(async () => {
    if (!cmsId || !reviewComment.trim()) return;
    setIsReviewActing(true);
    try {
      await saveReviewNote({ id: cmsId, type: cmsType, note: reviewComment });
      toast.success('Review notes saved');
    } catch (err) { toast.error(toUserMessage(err, 'Failed to save review notes')); }
    finally { setIsReviewActing(false); }
  }, [cmsId, cmsType, saveReviewNote, reviewComment]);

  const handleSaveAndApprove = useCallback(async () => {
    if (!cmsId) return;
    setIsReviewActing(true);
    try {
      await updateCms.mutateAsync({ id: cmsId, data: buildUpdateData() });
      if (contentBlocks.length > 0) {
        await uploadBody.mutateAsync({ id: cmsId, content: JSON.stringify(contentBlocks), type: cmsType });
      }
      await approveCms({ id: cmsId, type: cmsType, data: undefined });
      toast.success(cmsType === 'COURSE'
        ? 'Course saved and approved — ready to publish'
        : 'Article saved and approved — a publisher will pick it up from the queue');
      onSaveAndApproveSuccess?.();
    } catch (err) {
      toast.error(toUserMessage(err, 'Failed to save and approve'));
    } finally {
      setIsReviewActing(false);
    }
  }, [cmsId, cmsType, updateCms, uploadBody, approveCms, buildUpdateData, contentBlocks, onSaveAndApproveSuccess]);

  const handleSaveAndPublish = useCallback(async () => {
    if (!cmsId) return;
    setIsReviewActing(true);
    try {
      await updateCms.mutateAsync({ id: cmsId, data: buildUpdateData() });
      if (contentBlocks.length > 0) {
        await uploadBody.mutateAsync({ id: cmsId, content: JSON.stringify(contentBlocks), type: cmsType });
      }
      await publishCms({ id: cmsId, type: cmsType, data: undefined });
      toast.success(cmsType === 'COURSE' ? 'Course saved and published' : 'Article saved and published');
      onSaveAndPublishSuccess?.();
    } catch (err) {
      toast.error(toUserMessage(err, 'Failed to save and publish'));
    } finally {
      setIsReviewActing(false);
    }
  }, [cmsId, cmsType, updateCms, uploadBody, publishCms, buildUpdateData, contentBlocks, onSaveAndPublishSuccess]);

  return {
    reviewComment,
    setReviewComment,
    isReviewActing,
    reassignNote,
    setReassignNote,
    showReassignPanel,
    setShowReassignPanel,
    handleApprove,
    handlePublish,
    handleSendBack,
    handleReject,
    handleClaimReview,
    handleClaimForPublishing,
    handleReassignReview,
    handleSaveReviewNote,
    handleSaveAndApprove,
    handleSaveAndPublish,
  };
}
