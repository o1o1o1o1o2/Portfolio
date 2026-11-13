import profiles from './office-depth-strips.json' with { type: 'json' };

export const officeDepthProfiles = profiles;
export function officeSupportY(y: number, supportOffsetY: number) {
  return y + supportOffsetY;
}
