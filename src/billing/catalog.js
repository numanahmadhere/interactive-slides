// Paddle product and price ids. These are identifiers, not secrets. The live ids were
// created in the live account; the sandbox ids are filled in after the same catalog is
// created in sandbox (they are different ids). Until then the sandbox set is empty and
// checkout says it is not ready.

export const CATALOG = {
  live: {
    starter: { month: 'pri_01m43t4vfabcmdka0rd0qz1xyd', year: 'pri_01m43t4vrtkebaryyweesxvkdd' },
    pro: { month: 'pri_01m43t4w1wkgg6zcaxgh7ffggd', year: 'pri_01m43t4wb9db10wk4vb3paeh3q' },
    advanced: { month: 'pri_01m43t4wpg548h9whew5dfh8ph', year: 'pri_01m43t4xmznjv6yqcekhez35hj' },
  },
  sandbox: {
    starter: { month: '', year: '' },
    pro: { month: '', year: '' },
    advanced: { month: '', year: '' },
  },
};

// Reverse lookup used by the webhook: a price id tells us which plan was bought.
export function planByPrice(priceId) {
  for (const env of Object.values(CATALOG)) {
    for (const [plan, byInterval] of Object.entries(env)) {
      for (const [interval, id] of Object.entries(byInterval)) if (id && id === priceId) return { plan, interval };
    }
  }
  return null;
}
