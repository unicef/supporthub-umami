import { Button, type ButtonProps, Column, Icon, Row, Text } from '@umami/react-zen';
import { AdminNav } from '@/app/(main)/admin/AdminNav';
import { SettingsNav } from '@/app/(main)/settings/SettingsNav';
import { WebsiteNav } from '@/app/(main)/websites/[websiteId]/WebsiteNav';
import { IconLabel } from '@/components/common/IconLabel';
import { OverlayScrollArea } from '@/components/common/OverlayScrollArea';
import styles from '@/components/common/OverlayScrollArea.module.css';
import { useGlobalState, useNavigation } from '@/components/hooks';
import { PanelLeft } from '@/components/icons';
import { UserButton } from '@/components/input/UserButton';
import { Logo } from '@/components/svg';

export function SideNav(props: any) {
  // SupportHub fork: the global navigation (Dashboard / Boards / Websites /
  // Links / Pixels) is removed. Tenant admins SSO straight into their own
  // website; they must not browse to other global areas. Only the per-website
  // nav, the settings/admin sub-navs, and the user menu remain.
  const { pathname, websiteId } = useNavigation();
  const [isCollapsed] = useGlobalState('sidenav-collapsed', false);

  return (
    <Column
      {...props}
      backgroundColor="surface"
      border
      borderRadius
      padding="2"
      flexGrow="1"
      minHeight="0"
      margin="2"
      style={{
        width: isCollapsed ? '60px' : '240px',
        transition: 'width 0.2s ease-in-out',
        overflow: 'hidden',
      }}
    >
      <Row
        alignItems="center"
        justifyContent="space-between"
        minHeight="9"
        style={{ flexShrink: 0 }}
      >
        <Row
          padding="3"
          alignItems="center"
          justifyContent={isCollapsed ? 'center' : 'space-between'}
          flexGrow="1"
        >
          {!isCollapsed && (
            <IconLabel icon={<Logo />}>
              <Text weight="bold">umami</Text>
            </IconLabel>
          )}
          <PanelButton />
        </Row>
      </Row>
      <OverlayScrollArea
        className={isCollapsed ? styles.collapsed : undefined}
        style={{ flexGrow: 1, minHeight: 0 }}
      >
        {websiteId ? (
          <WebsiteNav websiteId={websiteId} isCollapsed={isCollapsed} />
        ) : pathname.includes('/settings') ? (
          <SettingsNav isCollapsed={isCollapsed} />
        ) : pathname.includes('/admin') ? (
          <AdminNav />
        ) : null}
      </OverlayScrollArea>
      <Row
        paddingTop="2"
        width="100%"
        justifyContent={isCollapsed ? 'center' : undefined}
        style={{ flexShrink: 0 }}
      >
        <UserButton showText={!isCollapsed} />
      </Row>
    </Column>
  );
}

const PanelButton = (props: ButtonProps) => {
  const [isCollapsed, setIsCollapsed] = useGlobalState('sidenav-collapsed', false);
  return (
    <Button
      onPress={() => setIsCollapsed(!isCollapsed)}
      variant="zero"
      {...props}
      style={{ padding: 0 }}
    >
      <Icon strokeColor="muted">
        <PanelLeft />
      </Icon>
    </Button>
  );
};
