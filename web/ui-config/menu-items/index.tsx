import {
  BookOpenIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/outline';
import { t } from '@lingui/macro';
import { ReactNode } from 'react';
import { ROUTES } from 'components/primitives/Link';

interface Navigation {
  link: string;
  title: string;
  dataCy?: string;
}

export const navigation: Navigation[] = [
  {
    link: ROUTES.dashboard,
    title: t`Dashboard`,
    dataCy: 'menuDashboard',
  },
  {
    link: ROUTES.markets,
    title: t`Pools`,
    dataCy: 'menuMarkets',
  },
  {
    link: ROUTES.history,
    title: t`Transactions`,
    dataCy: 'menuTransactions',
  },
];

interface MoreMenuItem extends Navigation {
  icon: ReactNode;
  makeLink?: (walletAddress: string) => string;
}

const moreMenuItems: MoreMenuItem[] = [
  {
    link: '/',
    title: t`FAQ`,
    icon: <QuestionMarkCircleIcon />,
  },
  {
    link: '/',
    title: t`Developers`,
    icon: <BookOpenIcon />,
  },
];

export const moreNavigation: MoreMenuItem[] = [...moreMenuItems];
