import React from "react";

export type EmptyStateProps = {
  icon?: string;
  title: string;
  text?: string;
};

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = "✨", title, text }) => {
  return (
    <div className="rezzy-empty">
      <div className="rezzy-empty__icon">{icon}</div>
      <div className="rezzy-empty__title">{title}</div>
      {text && <div className="rezzy-empty__text">{text}</div>}
    </div>
  );
};