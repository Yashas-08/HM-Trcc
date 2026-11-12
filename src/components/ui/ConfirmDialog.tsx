import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  loading = false,
}) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-[15px] font-semibold leading-[1.3] text-[#292929] bg-[#FFFFFF] border border-[#E9E9E9] rounded-[8px] hover:bg-[#F4F4F4] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-[15px] font-semibold leading-[1.3] text-white rounded-[8px] disabled:opacity-50 ${
              danger ? 'bg-[#D9383A] hover:bg-[#B82D2F]' : 'bg-[#222222] hover:bg-[#333333]'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 ${
            danger ? 'bg-[#D9383A]/10 text-[#D9383A]' : 'bg-[#F4F4F4] text-[#292929]'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-[16px] text-[#292929] leading-[1.5]">{message}</p>
      </div>
    </Modal>
  );
};

