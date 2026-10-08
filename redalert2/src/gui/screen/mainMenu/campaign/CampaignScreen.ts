import { playMovie } from '@/gui/MoviePlayer';
import { jsx } from '@/gui/jsx/jsx';
import { HtmlView } from '@/gui/jsx/HtmlView';
import { MainMenuScreenType } from '@/gui/screen/ScreenType';
import { MainMenuScreen } from '@/gui/screen/mainMenu/MainMenuScreen';
import { MainMenuRoute } from '@/gui/screen/mainMenu/MainMenuRoute';
import { CampaignSel } from './CampaignSel';
import { CAMPAIGNS, CampaignSide, DIFFICULTY_LABELS, loadProgress, saveProgress, useCampaigns } from './CampaignData';
import { Engine } from '@/engine/Engine';
import { EngineType } from '@/engine/EngineType';

/**
 * Écran de campagne : choix Alliés / Soviétiques, liste des opérations (débloquées au fil des
 * victoires), difficulté, briefing de la mission choisie, lancement.
 */
export class CampaignScreen extends MainMenuScreen {
    declare public title: string;
    private form?: any;
    private side: CampaignSide = "allied";
    private difficulty = 1;
    private selected = 0;

    constructor(private strings: any, private jsxRenderer: any, private music?: any) {
        super();
        this.title = 'Campaign';
    }

    private text(key: string, fallback: string): string {
        try {
            const value = this.strings.get(key);
            return value && value !== key ? value : fallback;
        }
        catch {
            return fallback;
        }
    }

    private props(): any {
        const progress = loadProgress();
        const missions = CAMPAIGNS[this.side];
        const won = progress.won[this.side];
        const unlocked = Math.min(missions.length - 1, won);
        this.selected = Math.min(this.selected, unlocked);
        const mission = missions[this.selected];
        return {
            title: `${Engine.getActiveEngine() === EngineType.YurisRevenge ? "Yuri's Revenge - " : ''}${this.side === 'allied' ? 'Allied' : 'Soviet'} Campaign - ${DIFFICULTY_LABELS[this.difficulty]}`,
            missions,
            names: missions.map((m) => this.text(`NAME:${m.key}`, m.key)),
            unlocked,
            won,
            selected: this.selected,
            briefing: this.text(`BRIEF:${mission.key}`, ''),
            onSelect: (index: number, doubleClick?: boolean) => {
                this.selected = index;
                this.refresh();
                if (doubleClick) {
                    this.launch();
                }
            },
        };
    }

    private refresh(): void {
        this.form?.applyOptions((options: any) => Object.assign(options, this.props()));
        this.updateSidebarButtons();
    }

    private persist(): void {
        const progress = loadProgress();
        progress.side = this.side;
        progress.difficulty = this.difficulty;
        saveProgress(progress);
    }

    async onEnter(): Promise<void> {
        useCampaigns(Engine.getActiveEngine() === EngineType.YurisRevenge);
        const progress = loadProgress();
        this.side = progress.side;
        this.difficulty = progress.difficulty;
        // Par défaut, la première mission pas encore gagnée.
        this.selected = Math.min(CAMPAIGNS[this.side].length - 1, progress.won[this.side]);
        this.controller?.toggleMainVideo(false);
        this.controller?.setMainComponent(this.jsxRenderer.render(jsx(HtmlView, {
            innerRef: (ref: any) => (this.form = ref),
            component: CampaignSel,
            props: this.props(),
        }))[0]);
        this.updateSidebarButtons();
        this.controller?.showSidebarButtons();
    }

    private launching = false;

    private async launch(): Promise<void> {
        if (this.launching) {
            return;
        }
        this.launching = true;
        const mission = CAMPAIGNS[this.side][this.selected];
        this.persist();
        // Film de briefing de l'opération (A01_f00e, A02_f00e… / S01_f00e…), comme au lancement d'une mission RA2.
        const film = `${this.side === 'allied' ? 'A' : 'S'}${mission.key.slice(3, 5)}_f00e`;
        try {
            // La musique du menu se tait pendant le film (elle reprend avec la mission).
            this.music?.stopPlaying?.();
            await playMovie(film, 'full');
        }
        finally {
            this.launching = false;
        }
        (window as any).__ra2LaunchMission?.(mission.map, this.difficulty, new MainMenuRoute(MainMenuScreenType.Campaign, {}));
    }

    private updateSidebarButtons(): void {
        this.controller?.setSidebarButtons([
            {
                label: 'Start Mission',
                onClick: () => this.launch(),
            },
            {
                label: this.side === 'allied' ? 'Soviet Campaign' : 'Allied Campaign',
                onClick: () => {
                    this.side = this.side === 'allied' ? 'soviet' : 'allied';
                    this.selected = Math.min(CAMPAIGNS[this.side].length - 1, loadProgress().won[this.side]);
                    this.persist();
                    this.refresh();
                },
            },
            {
                label: `Difficulty: ${DIFFICULTY_LABELS[this.difficulty]}`,
                onClick: () => {
                    this.difficulty = (this.difficulty + 1) % 3;
                    this.persist();
                    this.refresh();
                },
            },
            {
                label: this.strings.get('GUI:Back'),
                isBottom: true,
                onClick: () => this.controller?.goToScreen(MainMenuScreenType.Home),
            },
        ]);
    }

    async onLeave(): Promise<void> {
        this.form = undefined;
        this.controller?.setMainComponent();
        await this.controller?.hideSidebarButtons();
    }
}
