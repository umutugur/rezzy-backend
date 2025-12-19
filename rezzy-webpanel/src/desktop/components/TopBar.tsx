import React from "react";

export type SummaryChipTone = "success" | "warning" | "danger" | "neutral";

export type SummaryChip = {
  label: string;
  value: string;
  tone?: SummaryChipTone;
};

export type TopBarProps = {
  title: string;
  subtitle?: string;
  summaryChips?: SummaryChip[];
};

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
  summaryChips,
}) => {
  // Varsayılan mock özet (hiç summaryChips gelmezse)
  // NOTE: Currency is resolved at layout/page level. Keep this mock currency-agnostic.
  const todaySummary = {
    covers: 86,
    total: "24.380",
    rezvixRate: 38,
  };

  const user = {
    initials: "GU",
    name: "Garson Uğur",
    role: "Servis",
  };

  const hasCustomSummary = summaryChips && summaryChips.length > 0;

  const chips: SummaryChip[] = hasCustomSummary
    ? summaryChips!
    : [
        {
          label: "Bugün kişi",
          value: `${todaySummary.covers} kişi`,
          tone: "success",
        },
        {
          label: "Toplam hesap",
          // Currency symbol should be injected via `summaryChips` by the calling page.
          value: todaySummary.total,
          tone: "warning",
        },
        {
          label: "Rezvix oranı",
          value: `%${todaySummary.rezvixRate}`,
          tone: "danger",
        },
      ];

  const dotClass = (tone?: SummaryChipTone) => {
    if (tone === "warning") return "rezvix-chip__dot rezvix-chip__dot--warning";
    if (tone === "danger") return "rezvix-chip__dot rezvix-chip__dot--danger";
    return "rezvix-chip__dot"; // success + neutral
  };

  return (
    <header className="rezvix-topbar">
      <div className="rezvix-topbar__left">
        <h1 className="rezvix-topbar__title">{title}</h1>
        {subtitle && <p className="rezvix-topbar__subtitle">{subtitle}</p>}
      </div>

      <div className="rezvix-topbar__right">
        <div className="rezvix-topbar__summary">
          {chips.map((chip, idx) => (
            <div key={idx} className="rezvix-chip">
              <span className={dotClass(chip.tone)} />
              {/* Label + value; istersen label'i sadeleştiririz */}
              <span>
                {chip.label ? `${chip.label}: ${chip.value}` : chip.value}
              </span>
            </div>
          ))}
        </div>

        <div className="rezvix-topbar__user">
          <div className="rezvix-topbar__avatar">{user.initials}</div>
          <div className="rezvix-topbar__user-info">
            <span className="rezvix-topbar__user-name">{user.name}</span>
            <span className="rezvix-topbar__user-role">{user.role}</span>
          </div>
        </div>
      </div>
    </header>
  );
};