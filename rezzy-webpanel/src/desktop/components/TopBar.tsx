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
  const todaySummary = {
    covers: 86,
    total: "24.380₺",
    rezzyRate: 38,
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
          value: todaySummary.total,
          tone: "warning",
        },
        {
          label: "Rezzy oranı",
          value: `%${todaySummary.rezzyRate}`,
          tone: "danger",
        },
      ];

  const dotClass = (tone?: SummaryChipTone) => {
    if (tone === "warning") return "rezzy-chip__dot rezzy-chip__dot--warning";
    if (tone === "danger") return "rezzy-chip__dot rezzy-chip__dot--danger";
    return "rezzy-chip__dot"; // success + neutral
  };

  return (
    <header className="rezzy-topbar">
      <div className="rezzy-topbar__left">
        <h1 className="rezzy-topbar__title">{title}</h1>
        {subtitle && <p className="rezzy-topbar__subtitle">{subtitle}</p>}
      </div>

      <div className="rezzy-topbar__right">
        <div className="rezzy-topbar__summary">
          {chips.map((chip, idx) => (
            <div key={idx} className="rezzy-chip">
              <span className={dotClass(chip.tone)} />
              {/* Label + value; istersen label'i sadeleştiririz */}
              <span>
                {chip.label ? `${chip.label}: ${chip.value}` : chip.value}
              </span>
            </div>
          ))}
        </div>

        <div className="rezzy-topbar__user">
          <div className="rezzy-topbar__avatar">{user.initials}</div>
          <div className="rezzy-topbar__user-info">
            <span className="rezzy-topbar__user-name">{user.name}</span>
            <span className="rezzy-topbar__user-role">{user.role}</span>
          </div>
        </div>
      </div>
    </header>
  );
};