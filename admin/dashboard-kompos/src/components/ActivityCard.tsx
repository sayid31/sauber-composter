import { Check, Wrench } from "lucide-react";

type ActivityItem = { title: string; detail: string; ts: string };

// ✅ ICON EMBER (BUCKET) pakai SVG biar mirip gambar & pasti ada
function BucketIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7h18l-1.6 14H4.6L3 7z" />
      <path d="M7 7V5a5 5 0 0 1 10 0v2" />
    </svg>
  );
}

function pickActivityIcon(title: string) {
  const t = title.toLowerCase();

  // Kompos Jadi (orange) -> ✅ ember, bukan cart
  if (t.includes("kompos")) {
    return { kind: "orange", Icon: BucketIcon };
  }

  // Alat Baru (blue)
  if (t.includes("alat")) {
    return { kind: "blue", Icon: Wrench };
  }

  // Pengguna Baru (green)
  return { kind: "green", Icon: Check };
}

export default function ActivityCard({
  title,
  items,
}: {
  title: string;
  items: ActivityItem[];
}) {
  return (
    <div className="activityCard">
      <div className="activityHeader">{title}</div>

      <div className="activityList">
        {items.map((it, idx) => {
          const { kind, Icon } = pickActivityIcon(it.title);

          return (
            <div className="activityRow" key={idx}>
              <div className={`activityIconWrap ${kind}`}>
                <Icon size={16} />
              </div>

              <div>
                <div className="activityTitle">{it.title}</div>
                <div className="activityTime">{it.detail}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="activityFooter">
        <a className="activityLink" href="#">
          Lihat Semua
        </a>
      </div>
    </div>
  );
}
