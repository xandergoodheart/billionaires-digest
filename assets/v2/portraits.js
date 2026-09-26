/* Billionaires Digest v2: illustrated portrait lookup. ES5, one global: BDPortraits.
   slug -> { img: 'path to the portrait', dollar: 'path to the "$ eyes" close-up version' } (both optional, site-relative).
   EMPTY on purpose: portraits are added only after the owner approves the illustrated style. Until then every
   page falls back to the initials sector plate (and Lucky five's close-up to its generic cartoon face).
   Never photos of real people, never company logos. */
(function(root){
  root.BDPortraits = root.BDPortraits || {};
})(typeof window !== 'undefined' ? window : globalThis);
