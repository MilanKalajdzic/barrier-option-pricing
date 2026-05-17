# Monte Carlo Pricing of a Barrier Option

Python version: 3.11

## Overview

This project implements a Monte Carlo simulation framework to price a path-dependent derivative — an **up-and-out barrier call option** — under the assumption that the underlying asset follows a Geometric Brownian Motion (GBM).

Unlike standard European options, barrier options depend on the entire price path of the underlying. This makes analytical pricing difficult and motivates the use of numerical methods such as Monte Carlo simulation.

---

## Model Description

The underlying asset price is modeled using Geometric Brownian Motion under the **risk-neutral measure**, where the expected return equals the risk-free rate.
Simulations are performed under the risk-neutral measure, where the expected return equals the risk-free rate.

The option payoff is defined as:

* If the barrier is breached at any time before maturity → payoff = 0
* Otherwise → payoff = max(S_T − K, 0)

---

## Methodology

The pricing is performed using Monte Carlo simulation:

1. Simulate multiple asset price paths using discretized GBM
2. Apply the barrier condition to each path
3. Compute the payoff at maturity
4. Discount the expected payoff back to present value

---

## Key Features

* **Path-dependent option pricing**
* **Antithetic variates** for variance reduction
* **Confidence interval estimation** for statistical accuracy
* **Convergence analysis** to validate simulation stability
* Comparison with **vanilla European option pricing**

---

## Results

The results demonstrate that:

* Barrier options are cheaper than standard European options due to the knockout feature
* Monte Carlo estimates converge as the number of simulations increases
* Variance reduction techniques improve the efficiency and stability of the estimator

---

## Limitations

The model relies on several simplifying assumptions:

* **Geometric Brownian Motion** assumes constant volatility and log-normal returns
* **Discrete barrier monitoring** may miss barrier crossings between time steps
* Monte Carlo methods introduce **statistical noise** and require many simulations
* Computational cost increases with accuracy requirements

---

## Requirements

Install required packages:

```
pip install -r requirements.txt
```

Dependencies:

* numpy
* matplotlib
* scipy

---

## How to Run

1. Open the notebook:

```
Project.ipynb
```

2. Run all cells to reproduce results

---

## Reproducibility

All results are fully reproducible. The notebook contains:

* Complete implementation
* Fixed parameters
* No external data dependencies

---

## Conclusion

This project demonstrates how Monte Carlo simulation can be used to price complex derivatives that cannot be handled analytically. It highlights both the flexibility of simulation-based methods and their practical limitations in quantitative finance.

---
