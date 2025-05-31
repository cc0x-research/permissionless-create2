import { keccak_256 } from "@noble/hashes/sha3";

import BootstrapArtifact from "../build/hardhat/artifacts/contracts/Bootstrap.sol/Bootstrap.json" with { type: "json" };

const providers = [];

function providerAnnounced({ info, provider }) {
  const select = document.querySelector("#wallet-provider");

  const index = providers.length;
  providers.push(provider);

  const name = document.createTextNode(info.name);
  const option = document.createElement("option");
  option.appendChild(document.createTextNode(info.name));
  option.setAttribute("value", index);
  select.appendChild(option);

  const connect = document.querySelector("#wallet-connect");
  connect.disabled = false;
}

async function jsonrpc(request) {
  const select = document.querySelector("#wallet-provider");
  const provider = providers[select.value];
  if (provider === undefined) {
    throw new Error("no provider selected");
  }
  return await provider.request(request);
}

async function connectProvider() {
  await jsonrpc({ method: "eth_requestAccounts" });
  updateStatuses();
}

async function updateStatuses() {
  const b = {
    status: document.querySelector("#bootstrap-status"),
    deploy: document.querySelector("#bootstrap-deploy"),
  };
  const f = {
    status: document.querySelector("#factory-status"),
    deploy: document.querySelector("#factory-deploy"),
  };

  const [bootstrap, factory] = await Promise.all([
    deployedBootstrap(),
    deployedFactory(),
  ]);

  if (bootstrap !== null) {
    b.status.innerText = "Deployed";
  } else {
    b.status.innerText = "Not Deployed";
    b.deploy.disabled = factory !== null;
  }

  if (factory !== null) {
    f.status.innerText = "Deployed";
  } else {
    f.status.innerText = "Not Deployed";
    f.deploy.disabled = bootstrap === null;
  }
}

function isAddress(value) {
  return `${value}`.match(/^0x[0-9A-Fa-f]{40}$/);
}

async function deployedBootstrap(newValue) {
  const chainId = await jsonrpc({ method: "eth_chainId" });
  const key = `bootstrap:${chainId}`;

  const value = window.localStorage.getItem(key);
  if (isAddress(newValue)) {
    window.localStorage.setItem(key, newValue);
  }

  if (isAddress(value)) {
    return value;
  } else {
    return null;
  }
}

async function deployedFactory() {
  const address = "0xC0DE207acb0888c5409E51F27390Dad75e4ECbe7";
  const code = await jsonrpc({
    method: "eth_getCode",
    params: [address, "latest"],
  });
  if (code === "0x60205f3581360380835f375f34f58060145790fd5b5f525ff3") {
    return address;
  } else {
    return null;
  }
}

async function deployBootstrap() {
  const status = document.querySelector("#bootstrap-status");
  const deploy = document.querySelector("#bootstrap-deploy");

  status.innerText = "Deploying...";
  deploy.disabled = true;
  try {
    const [account] = await jsonrpc({ method: "eth_requestAccounts" });
    const { bytecode } = BootstrapArtifact;
    const transaction = await jsonrpc({
      method: "eth_sendTransaction",
      params: [{ from: account, data: bytecode }],
    });

    let receipt = null;
    do {
      await sleep(1000);
      receipt = await jsonrpc({
        method: "eth_getTransactionReceipt",
        params: [transaction],
      });
    } while (receipt === null);

    const { status, contractAddress } = receipt;
    if (status === "0x1") {
      await deployedBootstrap(contractAddress);
    }
  } catch {
  } finally {
    await updateStatuses();
  }
}

async function deployFactory() {
  const status = document.querySelector("#factory-status");
  const deploy = document.querySelector("#factory-deploy");

  status.innerText = "Deploying...";
  deploy.disabled = true;
  try {
    const bootstrap = await deployedBootstrap();
    const [account] = await jsonrpc({ method: "eth_requestAccounts" });
    const nonce = await jsonrpc({
      method: "eth_getTransactionCount",
      params: ["0x962560A0333190D57009A0aAAB7Bfa088f58461C", "latest"],
    });
    const authorization = signDelegation({
      chainId: 0x1337,
      address: bootstrap,
      nonce: 1,
    });
    const transaction = await jsonrpc({
      method: "eth_sendTransaction",
      params: [
        {
          from: account,
          to: bootstrap,
          data: "0x775c300c",
          authorizationList: [authorization],
        },
      ],
    });

    let receipt = null;
    do {
      await sleep(1000);
      receipt = await jsonrpc({
        method: "eth_getTransactionReceipt",
        params: [transaction],
      });
    } while (receipt === null);

    const { status } = receipt;
    if (status === "0x1") {
      await sleep(1000);
    }
  } finally {
    await updateStatuses();
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rlp(value) {
  function lenPrefix(hex, offset) {
    const len = hexLength(hex);
    if (len < 56) {
      const prefix = (len + offset).toString(16);
      return hexConcat(prefix, hex);
    } else {
      // Be even more restrictive with maximum length... We only need
      // to encode short RLP data.
      if (len > 0xffffffff) {
        throw new Error("too long");
      }
      const lhex = rlp(BigInt(len));
      const llen = hexLength(lhex);
      const prefix = (llen + offset + 55).toString(16);
      return hexConcat(prefix, lhex, hex);
    }
  }

  if (Array.isArray(value)) {
    const items = hexConcat(...value.map(rlp));
    return lenPrefix(items, 0xc0);
  } else if (typeof value === "string") {
    if (hexLength(value) && Number(value) < 0x80) {
      return value;
    } else {
      return lenPrefix(value, 0x80);
    }
  } else if (typeof value === "bigint") {
    const hex = value.toString(16).replace(/^0*/, "");
    const padding = "0".repeat(hex.length % 2);
    return rlp(`0x${padding}${hex}`);
  } else {
    throw new Error(`invalid value ${value}`);
  }
}

function hexLength(hex) {
  return hex.replace(/^0x/, "").length / 2;
}

function hexConcat(...hex) {
  const stripped = hex.map((h) => h.replace(/^0x/, ""));
  return `0x${stripped.join("")}`;
}

function bytesToInt(bytes) {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return BigInt(`0x${hex}`);
}

function signDelegation({ chainId, address, nonce }) {
  const delegation = keccak_256(
    hexConcat("0x05", rlp([BigInt(chainId), address, BigInt(nonce)])),
  );

  // Using a known nonce for ECDSA signing leaks the private key! Do
  // not do this **ever** with an actual secret private key, as
  // someone will be able to compute it from the signature. However,
  // since the deployer account is already public, we can take some
  // shortcuts here with computing an ECDSA signature with a fixed
  // nonce of `1`, which allows us to GREATLY simplify the code and
  // reduce the bundle size (since we don't actually have to include a
  // `secp256k1` implementation.
  const r = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
  const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const d = 0x942ba639ec667bdded6d727ad2e483648a34b584f916e6b826fdb7b512633731n;

  const z = bytesToInt(delegation);
  const s = (z + r*d) % n;

  return {
    chainId,
    address,
    nonce,
    yParity: "0x0",
    r: `0x${r.toString(16)}`,
    s: `0x${s.toString(16).padStart(64, "0")}`,
  }
}

window.addEventListener("eip6963:announceProvider", (event) => {
  providerAnnounced(event.detail);
});
window.dispatchEvent(new Event("eip6963:requestProvider"));

document
  .querySelector("#wallet-connect")
  .addEventListener("click", connectProvider);
document
  .querySelector("#bootstrap-deploy")
  .addEventListener("click", deployBootstrap);
document
  .querySelector("#factory-deploy")
  .addEventListener("click", deployFactory);
