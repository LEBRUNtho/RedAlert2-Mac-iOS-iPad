import React, { useRef, useEffect } from 'react';
import { List, ListItem } from '@/gui/component/List';
import { CampaignMission } from './CampaignData';

interface CampaignSelProps {
    title: string;
    missions: CampaignMission[];
    names: string[];
    /** Index de la dernière mission jouable (les suivantes sont verrouillées). */
    unlocked: number;
    won: number;
    selected: number;
    briefing: string;
    onSelect: (index: number, doubleClick?: boolean) => void;
}

/** Liste des opérations d'une campagne et briefing de la mission choisie. */
export const CampaignSel: React.FC<CampaignSelProps> = ({ title, missions, names, unlocked, won, selected, briefing, onSelect }) => {
    const selectedRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        selectedRef.current?.scrollIntoView();
    }, [selected]);
    return (<div className="replay-sel-form">
      <List title={title} className="replay-list campaign-list">
        {missions.map((mission, index) => {
            const locked = index > unlocked;
            const isSelected = index === selected;
            return (<ListItem key={mission.map} selected={isSelected} innerRef={isSelected ? selectedRef : null}
                onClick={() => !locked && onSelect(index)} onDoubleClick={() => !locked && onSelect(index, true)}
                disabled={locked} style={{ display: "flex", opacity: locked ? 0.4 : 1 }}>
                <div className="replay-name">{`${index + 1}. ${names[index]}`}</div>
                <div className="replay-time">{locked ? "Locked" : index < won ? "Complete" : ""}</div>
              </ListItem>);
        })}
      </List>
      <div className="replay-details" style={{ maxHeight: 190, overflowY: "auto", whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
        {briefing}
      </div>
    </div>);
};
