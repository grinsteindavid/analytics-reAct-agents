/**
 * Model enum for entity types used by AI workflow tools
 * Only entities used by the AI workflow tools
 */
export enum Model {
  AFFILIATES = 'Affiliate',
  CAMPAIGNS = 'Campaign',
  GROUPS = 'Group',
  LANDINGPAGES = 'LandingPage',
  LANDINGPAGEGROUP = 'LandingPagesGroup',
  OFFERCATEGORY = 'OfferCategory',
  OFFERGROUP = 'OffersGroup',
  OFFERS = 'Offer',
  ROTATIONS = 'Rotation',
  TAGS = 'Tag',
  TRAFFICSOURCE = 'TrafficSource',
  USERS = 'User',
}

/**
 * Traffic source platform identifiers
 * Trimmed to common platforms for the standalone project
 */
export enum TRAFFIC_API_NAMES {
  GOOGLE = 'GOOGLE',
  FACEBOOK = 'FACEBOOK',
  TABOOLA = 'TABOOLA',
  OUTBRAIN = 'OUTBRAIN',
  TIKTOK = 'TIKTOK',
  MEDIAGO = 'MEDIAGO',
  MGID = 'MGID',
  BING = 'BING',
  SNAPCHAT = 'SNAPCHAT',
  PINTEREST = 'PINTEREST',
  REVCONTENT = 'REVCONTENT',
}
