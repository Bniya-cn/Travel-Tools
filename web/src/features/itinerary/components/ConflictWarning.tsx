interface Props {
  message: string;
}

export function ConflictWarning({ message }: Props) {
  return (
    <div className="md-banner md-banner--error" role="alert">
      {message}
    </div>
  );
}
