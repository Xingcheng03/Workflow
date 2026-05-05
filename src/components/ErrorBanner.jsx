export const ErrorBanner = ({ message }) => {
  if (!message) return null;
  return (
    <div className="error-panel" role="alert">
      <strong>Agent error</strong>
      <span>{message}</span>
    </div>
  );
};
