import React from "react";

type Props = {
  title: string;
  value: string;
  variant: "green" | "blue";
  icon?: React.ReactNode;   // <- icon opsional
  showDot?: boolean;
};

export default function StatCard({ title, value, variant, icon, showDot }: Props) {
  const hasIcon = !!icon;

  return (
    <div className={`statCard ${variant}`}>
      <div className="statTitle">{title}</div>

      <div className="statCardInner">
        <div className="statLeft">
          <div className="statValue">{value}</div>
        </div>

        <div className={`statRight ${hasIcon ? "" : "noIcon"}`}>
          {hasIcon ? <span className="statIconWrap">{icon}</span> : null}
          {showDot ? <span className={`activeDot ${hasIcon ? "" : "only"}`} /> : null}
        </div>
      </div>
    </div>
  );
}
