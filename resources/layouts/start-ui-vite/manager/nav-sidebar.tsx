import { Link } from '@tanstack/react-router';
import {
  DatabaseIcon,
  LayoutDashboardIcon,
  PanelLeftIcon,
  ShieldCheckIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Logo } from '@/components/brand/logo';
import { IconBookOpen } from '@/components/icons/generated';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';

import type { Permission } from '@/features/auth/permissions';
import { WithPermissions } from '@/features/auth/with-permissions';
import { generatedNavItems } from '@/layout/manager/nav-generated';
import { NavUser } from '@/layout/manager/nav-user';

export const NavSidebar = (props: { children?: ReactNode }) => {
  const { t } = useTranslation(['layout']);
  return (
    <SidebarProvider>
      <Sidebar className="border-r border-sidebar-border/80 bg-[color:var(--pollux-surface)] shadow-[8px_0_32px_rgb(15_23_42/0.025)]">
        <SidebarHeader className="border-b border-sidebar-border/70 px-3 py-3">
          <div className="flex items-center">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="h-auto"
                  render={
                    <Link to="/manager">
                      <span>
                        <Logo className="w-24 group-data-[collapsible=icon]:w-18" />
                      </span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarTrigger
              className="group-data-[collapsible=icon]:hidden"
              icon={
                <>
                  <XIcon className="md:hidden" />
                  <PanelLeftIcon className="hidden md:block rtl:rotate-180" />
                </>
              }
            />
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-1 py-3">
          <SidebarGroup className="gap-1">
            <SidebarGroupLabel>{t('layout:nav.application')}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <Link to="/manager/dashboard">
                    {({ isActive }) => (
                      <SidebarMenuButton
                        isActive={isActive}
                        render={
                          <span>
                            <LayoutDashboardIcon />
                            <span>{t('layout:nav.dashboard')}</span>
                          </span>
                        }
                      />
                    )}
                  </Link>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <Link to="/manager/books">
                    {({ isActive }) => (
                      <SidebarMenuButton
                        isActive={isActive}
                        render={
                          <span>
                            <IconBookOpen />
                            <span>{t('layout:nav.books')}</span>
                          </span>
                        }
                      />
                    )}
                  </Link>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <WithPermissions
            permissions={[
              {
                user: ['list'],
              },
            ]}
          >
            <SidebarGroup className="gap-1">
              <SidebarGroupLabel>
                {t('layout:nav.configuration')}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <Link to="/manager/admin">
                      {({ isActive }) => (
                        <SidebarMenuButton
                          isActive={isActive}
                          render={
                            <span>
                              <ShieldCheckIcon />
                              <span>{t('layout:nav.admin')}</span>
                            </span>
                          }
                        />
                      )}
                    </Link>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <Link to="/manager/users">
                      {({ isActive }) => (
                        <SidebarMenuButton
                          isActive={isActive}
                          render={
                            <span>
                              <UsersIcon />
                              <span>{t('layout:nav.users')}</span>
                            </span>
                          }
                        />
                      )}
                    </Link>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </WithPermissions>
          {generatedNavItems.length > 0 && (
            <SidebarGroup className="gap-1">
              <SidebarGroupLabel>{t('layout:nav.entities')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {generatedNavItems.map((item) => (
                    <WithPermissions
                      key={item.entity}
                      permissions={
                        [{ [item.entity]: ['read'] }] as Permission[]
                      }
                    >
                      <SidebarMenuItem>
                        <Link to={item.to}>
                          {({ isActive }) => (
                            <SidebarMenuButton
                              isActive={isActive}
                              render={
                                <span>
                                  <DatabaseIcon />
                                  <span>{t(item.labelKey as never)}</span>
                                </span>
                              }
                            />
                          )}
                        </Link>
                      </SidebarMenuItem>
                    </WithPermissions>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border/70 p-3">
          <NavUser />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-transparent">
        {props.children}
      </SidebarInset>
    </SidebarProvider>
  );
};
