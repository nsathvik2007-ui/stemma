/* Endpoints any signed-in account uses, whatever its role. Safe to import from
   both route trees: nothing here carries teacher-only data. */

import { api } from './client';

export const accountApi = {
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ detail: string }>('/me/password/', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
};
