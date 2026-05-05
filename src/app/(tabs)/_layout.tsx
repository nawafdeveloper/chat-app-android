import AppTabs from '@/components/app-tabs';
import TabletAppTabs from '@/components/tablet-app-tabs';
import { useIsTablet } from '@/context/screen-checking-context';
import React from 'react';

export default function TabLayout() {
  const isTablet = useIsTablet();

  if (isTablet) {
    return <TabletAppTabs />;
  }

  return (
    <AppTabs />
  );
}
