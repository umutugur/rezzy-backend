import React from "react";

export type TopBarProps = {
  title: string;
  subtitle?: string;
};

export const TopBar: React.FC<TopBarProps> = ({ title, subtitle }) => {
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

  return (
    <header className="rezzy-topbar">
      <div className="rezzy-topbar__left">
        <h1 className="rezzy-topbar__title">{title}</h1>
        {subtitle && <p className="rezzy-topbar__subtitle">{subtitle}</p>}
      </div>

      <div className="rezzy-topbar__right">
        <div className="rezzy-topbar__summary">
          <div className="rezzy-chip">
            <span className="rezzy-chip__dot" />
            <span>Bugün {todaySummary.covers} kişi</span>
          </div>
          <div className="rezzy-chip">
            <span className="rezzy-chip__dot rezzy-chip__dot--warning" />
            <span>Toplam {todaySummary.total}</span>
          </div>
          <div className="rezzy-chip">
            <span className="rezzy-chip__dot rezzy-chip__dot--danger" />
            <span>%{todaySummary.rezzyRate} Rezzy</span>
          </div>
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