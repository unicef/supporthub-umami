import { AdminNav } from '@/app/(main)/admin/AdminNav';
import { SettingsNav } from '@/app/(main)/settings/SettingsNav';
import { WebsiteNav } from '@/app/(main)/websites/[websiteId]/WebsiteNav';
import { IconLabel } from '@/components/common/IconLabel';
import { useGlobalState, useNavigation } from '@/components/hooks';
import { PanelLeft } from '@/components/icons';
import { UserButton } from '@/components/input/UserButton';
import { Logo } from '@/components/svg';
import { Button, type ButtonProps, Column, Icon, Row, Text } from '@umami/react-zen';

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
      backgroundColor="surface-base"
      border
      borderRadius
      paddingX="2"
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
        height="60px"
        style={{ flexShrink: 0 }}
      >
        <Row paddingX="3" alignItems="center" justifyContent="space-between" flexGrow="1">
          {!isCollapsed && (
            <IconLabel icon={<Logo />}>
              <Text weight="bold">umami</Text>
            </IconLabel>
          )}
          <PanelButton />
        </Row>
      </Row>
      <Column flexGrow="1" minHeight="0" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
        {websiteId ? (
          <WebsiteNav websiteId={websiteId} isCollapsed={isCollapsed} />
        ) : pathname.includes('/settings') ? (
          <SettingsNav isCollapsed={isCollapsed} />
        ) : pathname.includes('/admin') ? (
          <AdminNav />
        ) : null}
      </Column>
      <Row marginBottom="4" paddingTop="2">
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
