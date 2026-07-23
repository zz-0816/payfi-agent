// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * MockUSDC — 测试用 ERC-20 代币
 *
 * 用于 Monad Testnet 上模拟 USDC 支付。
 * 6 位精度，部署时铸造 100 万枚给部署者。
 *
 * 编译参数：
 *   Compiler: 0.8.20
 *   EVM Version: paris（避免 PUSH0 问题）
 *   Optimization: 200 runs
 */

contract MockUSDC {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(uint256 _initialSupply) {
        totalSupply = _initialSupply;
        balanceOf[msg.sender] = _initialSupply;
        emit Transfer(address(0), msg.sender, _initialSupply);
    }

    function transfer(address _to, uint256 _value) external returns (bool) {
        require(balanceOf[msg.sender] >= _value, "ERC20: insufficient balance");
        balanceOf[msg.sender] -= _value;
        balanceOf[_to] += _value;
        emit Transfer(msg.sender, _to, _value);
        return true;
    }

    function approve(address _spender, uint256 _value) external returns (bool) {
        allowance[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) external returns (bool) {
        require(allowance[_from][msg.sender] >= _value, "ERC20: insufficient allowance");
        require(balanceOf[_from] >= _value, "ERC20: insufficient balance");
        allowance[_from][msg.sender] -= _value;
        balanceOf[_from] -= _value;
        balanceOf[_to] += _value;
        emit Transfer(_from, _to, _value);
        return true;
    }
}
