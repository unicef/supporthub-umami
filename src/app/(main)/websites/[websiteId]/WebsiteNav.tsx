import { Column, Focusable, Row, Text, Tooltip, TooltipTrigger } from '@umami/react-zen';
import Link from '@/components/common/Link';
import { IconLabel } from '@/components/common/IconLabel';
import { useMessages, useWebsiteNavItems } from '@/components/hooks';
import { ArrowLeft } from '@/components/icons';

export function WebsiteNav({
  websiteId,
  isCollapsed,
  onItemClick,
}: {
  websiteId: string;
  isCollapsed?: boolean;
  onItemClick?: () => void;
}) {
  const { t, labels } = useMessages();
  const { items, selectedKey } = useWebsiteNavItems(websiteId);

  return (
    <Column gap="2" marginTop={isCollapsed ? '2' : undefined}>
      {/* SupportHub fork: the website is the SSO landing page, so "Back" returns
          to SupportHub (the previous history entry) via history.back() instead
          of navigating to the (hidden) global /websites list. */}
      <div
        role="button"
        tabIndex={0}
        style={{ cursor: 'pointer' }}
        onClick={() => {
          onItemClick?.();
          window.history.back();
        }}
      >
        <TooltipTrigger isDisabled={!isCollapsed} delay={0}>
          <Focusable>
            <Row
              alignItems="center"
              hover={{ backgroundColor: 'surface-sunken' }}
              borderRadius
              minHeight="40px"
            >
              <IconLabel icon={<ArrowLeft />} label={isCollapsed ? '' : t(labels.back)} padding />
            </Row>
          </Focusable>
          <Tooltip placement="right">{t(labels.back)}</Tooltip>
        </TooltipTrigger>
      </div>
      {items.map(({ label: sectionLabel, items: sectionItems }, index) => (
        <Column key={`${sectionLabel}${index}`} gap="1" marginBottom="1">
          {!isCollapsed && (
            <Row padding>
              <Text weight="bold">{sectionLabel}</Text>
            </Row>
          )}
          {sectionItems.map(({ id, path, label, icon }) => {
            const isSelected = selectedKey === id;
            return (
              <Link key={id} href={path} role="button" onClick={onItemClick}>
                <TooltipTrigger isDisabled={!isCollapsed} delay={0}>
                  <Focusable>
                    <Row
                      alignItems="center"
                      hover={{ backgroundColor: 'surface-sunken' }}
                      backgroundColor={isSelected ? 'surface-sunken' : undefined}
                      borderRadius
                      minHeight="40px"
                    >
                      <IconLabel
                        icon={icon}
                        label={isCollapsed ? '' : label}
                        weight={isSelected ? 'bold' : undefined}
                        padding
                      />
                    </Row>
                  </Focusable>
                  <Tooltip placement="right">{label}</Tooltip>
                </TooltipTrigger>
              </Link>
            );
          })}
        </Column>
      ))}
    </Column>
  );
}
