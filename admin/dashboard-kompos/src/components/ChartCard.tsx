type DataPoint = { label: string; value: number };

export default function ChartCard({ title, data }: { title: string; data: DataPoint[] }) {
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));

  return (
    <div className="chartCard">
      <div className="chartTitle">{title}</div>

      <div className="chartArea">
        <div className="yAxis">
          <div>{max}</div>
          <div>{Math.round(max * 0.75)}</div>
          <div>{Math.round(max * 0.5)}</div>
          <div>{Math.round(max * 0.25)}</div>
          <div>0</div>
        </div>

        <div className="plot">
          <div className="bars">
            {data.map((d) => {
              const v = Number(d.value) || 0;
              const pct = (v / max) * 100;

              return (
                <div className="barGroup" key={d.label}>
                  <div className="bar" style={{ height: `${pct}%` }} />
                  <div className="barLabel">{d.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
