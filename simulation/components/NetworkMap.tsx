"use client";

interface MapFacility {
  id: string;
  name: string;
  city: string;
  map_x: number;
  map_y: number;
  fixed_cost_to_open: number;
}

interface MapCustomer {
  id: string;
  name: string;
  city: string;
  map_x: number;
  map_y: number;
  weekly_demand: number;
}

function arrowPoints(x1: number, y1: number, x2: number, y2: number, size = 1.8) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  // Shorten so the arrowhead sits just before the customer marker.
  const tipX = x2 - Math.cos(angle) * 3.2;
  const tipY = y2 - Math.sin(angle) * 3.2;
  const leftX = tipX - size * Math.cos(angle - Math.PI / 6);
  const leftY = tipY - size * Math.sin(angle - Math.PI / 6);
  const rightX = tipX - size * Math.cos(angle + Math.PI / 6);
  const rightY = tipY - size * Math.sin(angle + Math.PI / 6);
  return {
    lineEnd: { x: tipX, y: tipY },
    polygon: `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`,
  };
}

export function NetworkMap({
  facilities,
  customers,
  transportCosts,
  selected,
  onToggle,
}: {
  facilities: MapFacility[];
  customers: MapCustomer[];
  transportCosts: Record<string, Record<string, number>>;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const assignments = customers.map((customer) => {
    const selectedFacilities = facilities.filter((f) => selected.has(f.id));
    const facility = [...selectedFacilities].sort((a, b) => {
      const costDiff = transportCosts[a.id][customer.id] - transportCosts[b.id][customer.id];
      if (costDiff !== 0) return costDiff;
      return a.id.localeCompare(b.id);
    })[0];
    return { customer, facility };
  });

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-[var(--card-border)] bg-[#f7fafc]">
        <svg viewBox="0 0 100 92" className="block h-auto w-full" role="img" aria-label="Facility and customer network map">
          <defs>
            <linearGradient id="mapBackground" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="55%" stopColor="#eef3f8" />
              <stop offset="100%" stopColor="#e8eef5" />
            </linearGradient>
            <pattern id="mapGrid" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#e2e8f0" strokeWidth="0.25" />
            </pattern>
            <filter id="markerShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0.8" stdDeviation="0.8" floodOpacity="0.16" />
            </filter>
            <marker id="assignmentArrow" markerWidth="4" markerHeight="4" refX="3.2" refY="2" orient="auto">
              <path d="M0,0 L4,2 L0,4 Z" fill="#1e3a5f" opacity="0.75" />
            </marker>
          </defs>

          <rect width="100" height="92" fill="url(#mapBackground)" />
          <rect width="100" height="92" fill="url(#mapGrid)" opacity="0.55" />
          <path
            d="M5 25 L13 12 L27 10 L38 15 L48 13 L58 19 L67 16 L80 20 L93 30 L89 42 L93 51 L86 66 L80 69 L75 83 L64 79 L56 85 L44 80 L34 82 L28 72 L17 69 L12 58 L6 49 Z"
            fill="#fff"
            stroke="#d0d7e2"
            strokeWidth="0.7"
          />
          <path d="M26 11 L27 72 M48 14 L44 80 M67 17 L64 79 M12 58 L89 42 M17 69 L86 66" stroke="#edf0f4" strokeWidth="0.4" />

          {assignments.map(({ customer, facility }) => {
            if (!facility) return null;
            const arrow = arrowPoints(facility.map_x, facility.map_y, customer.map_x, customer.map_y);
            return (
              <g key={`${facility.id}-${customer.id}`} className="map-assignment-flow">
                <line
                  x1={facility.map_x}
                  y1={facility.map_y}
                  x2={arrow.lineEnd.x}
                  y2={arrow.lineEnd.y}
                  stroke="#1e3a5f"
                  strokeWidth="0.55"
                  opacity="0.55"
                />
                <polygon points={arrow.polygon} fill="#1e3a5f" opacity="0.72" />
              </g>
            );
          })}

          {customers.map((c) => (
            <g key={c.id} transform={`translate(${c.map_x} ${c.map_y})`}>
              <circle r="2.35" fill="#fff" stroke="#b45309" strokeWidth="0.85" filter="url(#markerShadow)" />
              <circle r="0.75" fill="#b45309" />
              <text x="3.2" y="-1" fontSize="2.65" fontWeight="700" fill="#334155">
                {c.id}
              </text>
              <text x="3.2" y="2.05" fontSize="2.05" fill="#64748b">
                {c.city.split(",")[0]}
              </text>
            </g>
          ))}

          {facilities.map((f) => {
            const isSelected = selected.has(f.id);
            return (
              <g
                key={f.id}
                transform={`translate(${f.map_x} ${f.map_y})`}
                onClick={() => onToggle(f.id)}
                className="cursor-pointer"
                role="button"
                aria-label={`${isSelected ? "Close" : "Open"} facility ${f.id}`}
              >
                <rect
                  x="-3"
                  y="-3"
                  width="6"
                  height="6"
                  rx="1.2"
                  fill={isSelected ? "#1e3a5f" : "#fff"}
                  stroke="#1e3a5f"
                  strokeWidth="0.85"
                  filter="url(#markerShadow)"
                />
                <text x="0" y="1" textAnchor="middle" fontSize="2.55" fontWeight="800" fill={isSelected ? "#fff" : "#1e3a5f"}>
                  {f.id}
                </text>
                <text x="4" y="-0.55" fontSize="2.3" fontWeight="700" fill="#334155">
                  {f.name}
                </text>
                <text x="4" y="2.05" fontSize="1.9" fill="#64748b">
                  {f.city}
                </text>
              </g>
            );
          })}
        </svg>

        {selected.size === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-max rounded-full border border-[var(--card-border)] bg-white/90 px-3 py-1.5 text-xs text-[var(--slate)] shadow-sm backdrop-blur">
            Select facilities to preview customer assignments
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-[var(--slate)]">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-[var(--navy)]" /> Open facility
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-[var(--navy)] bg-white" /> Candidate facility
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--amber)] bg-white" /> Customer
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5">
            <span className="w-4 border-t border-[var(--navy)] opacity-70" />
            <span className="text-[9px] leading-none text-[var(--navy)]">▶</span>
          </span>
          Serves customer
        </span>
      </div>
    </div>
  );
}
