export function LoadingScreen({ fullScreen = false }: { fullScreen?: boolean }) {
  return <div className={fullScreen ? 'loading-screen' : 'loading-area'} role="status" aria-label="Loading">
    <span className="loading-spinner" aria-hidden="true" />
  </div>;
}
