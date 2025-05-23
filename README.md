# Permissionless CREATE2 Factory

This project proposes a mechanism for permissionlessly deploying CREATE2 factory contracts (similar to the Safe singleton factory). This is an improvement over the status quo:

1. Unlike CREATE2 factories that rely on pre-signed transactions generated with Nick's method like the [Arachnid/deterministic-deployment-proxy](https://github.com/Arachnid/deterministic-deployment-proxy), it is not sensitive to different gas parameters on different networks, and works with networks that require EIP-155 replay protected transactions.
2. Unlike CREATE2 factories that use creation transactions (with `transaction.to = null`) like the [safe-global/safe-singleton-factory](https://github.com/safe-global/safe-singleton-factory) and [pcaversaccio/createx](https://github.com/pcaversaccio/createx) it is permissionless and does not require access to a secret private key.
3. Unlike any other method, a reverted transaction (out of gas for example) does not "burn" the factory address. It can be redeployed successfully with a subsequent transaction.

## Deployment

The address of the CREATE2 factory is `0xC0DEa6bB18fdb0182EE3a77e30e684A8FA5a450E` on all EVM chains.

## How it Works

This CREATE2 factory deployment method relies on a publicly known private key, which signs EIP-7702 delegations to execute the deployment. The public deployer account at address `0x962560A0333190D57009A0aAAB7Bfa088f58461C` signs a delegation to any contract that does a `CREATE2` with a predefined `INITCODE` and `SALT`:

```solidity
bytes constant INITCODE = hex"601f8060095f395ff35f35602036038060205f375f34f5806018573d5f5f3e5ffd5b5f5260205ff3";
bytes32 constant SALT = hex"d817eb709c5a0c86d13fbe0f8b653c3d5e16a37b6bac4ac6406bf5f7d09d6eb6";
```

This guarantees a CREATE2 factory contract be deployed to `0xC0DEa6bB18fdb0182EE3a77e30e684A8FA5a450E` with well-known code. Note that it is not an issue for the deployer private key to not be secret, as transactions from that account, or alternate delegations can neither prevent the successful deployment of the CREATE2 factory, or have it contain unexpected runtime code.

This repository contains a reference `Bootstrap` contract that the deployer account can delegate to in order to deploy the CREATE2 factory.

## Known Issues

It is possible to front-run transactions that invalidate the deployer's EIP-7702 delegation and cause the deployment to fail. This, however, comes at a gas cost to the attacker, with limited benefit beyond delaying the deployment of the CREATE2 factory. Additionally, persistent attackers can be circumvented by either using private transaction queues or working with block builders directly to ensure that the EIP-7702 bootstrapping transaction is not front-run.
