type Props = { message: string | null; onClose: () => void };

export function PlannerToast({ message, onClose }: Props) {
  if (!message) return null;
  return (
    <div className="planner-toast" role="alert" aria-live="assertive">
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="关闭提示">关闭</button>
    </div>
  );
}
