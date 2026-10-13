export default function GrafanaPanel({ src, title }: { src: string; title?: string }) {
  return (
    <div className="w-full h-[400px] rounded-xl overflow-hidden border border-slate-800 shadow-lg">
      <iframe
        src={src}
        width="100%"
        height="100%"
        frameBorder="0"
        title={title || "Grafana Panel"}
        className="w-full h-full"
      />
    </div>
  );
}