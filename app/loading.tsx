export default function Loading() {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-6xl items-center justify-center px-4 sm:px-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="spinner spinner-lg" aria-hidden="true" />
        <span>Loading</span>
      </div>
    </div>
  );
}
