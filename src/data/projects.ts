export type Project = {
  title: string;
  year: string;
  desc: string;
  url: string;
};

export const PROJECTS: Project[] = [
  {
    title: "Fibber Magees",
    year: "2025",
    desc: "Pub site with events, menu, and ordering in one place.",
    url: "https://fibbermagees.vercel.app/",
  },
  {
    title: "Verit",
    year: "2026",
    desc: "Corporate site built to turn visitors into inquiries.",
    url: "https://verit.ca/",
  },
  {
    title: "Bab Marrakech",
    year: "2026",
    desc: "Restaurant site that drives bookings and sells the menu.",
    url: "https://www.babmarrakech.ca/",
  },
  {
    title: "REOM Homes",
    year: "2026",
    desc: "Property management site that puts proof and transparency up front.",
    url: "https://reomhomes.vercel.app/",
  },
  {
    title: "About Us",
    year: "",
    desc: "The team who can bring your vision to life, your success to fruition, and your clientele to gratitude.",
    url: "mailto:ryan@carlyauto.ca",
  },
  {
    title: "Contact Now",
    year: "",
    desc: "Message us on WhatsApp to inquire about our services.",
    url: "https://wa.me/16139812555?text=Hi%2C%20I%27d%20like%20to%20inquire%20about%20your%20services.",
  },
];
